package telegram

import (
	"context"
	"fmt"
	"sync"
	"time"

	"pipelines/leader_election"
	"pipelines/logger"
)

// OrgListener escucha mensajes de Telegram para una organización completa.
// Usa LeaderElector externo para que solo una instancia haga polling
// cuando hay múltiples réplicas.
type OrgListener struct {
	OrgUID string
	botToken string

	// Leader election (externo)
	leaderElector *leader_election.LeaderElector

	// Configuración del poller
	pollerOpts []PollerOption

	// Subscripciones por chat_id
	mu            sync.RWMutex
	subscriptions map[int64][]chan *TelegramMessage

	// Control de ciclo de vida
	cancel   context.CancelFunc
	stopped  chan struct{}
	stopOnce sync.Once

	// Callbacks
	onError func(error)
	debug   bool

	log *logger.Logger
}

// OrgListenerOption configura el OrgListener
type OrgListenerOption func(*OrgListener)

// WithOrgErrorHandler configura el handler de errores
func WithOrgErrorHandler(handler func(error)) OrgListenerOption {
	return func(g *OrgListener) {
		g.onError = handler
	}
}

// WithOrgDebug habilita logging de debug
func WithOrgDebug(debug bool) OrgListenerOption {
	return func(g *OrgListener) {
		g.debug = debug
	}
}

// WithPollerOptions configura opciones adicionales para el Poller interno
func WithPollerOptions(opts ...PollerOption) OrgListenerOption {
	return func(g *OrgListener) {
		g.pollerOpts = opts
	}
}

// NewOrgListener crea un nuevo OrgListener
func NewOrgListener(
	leaderElector *leader_election.LeaderElector,
	OrgUID, botToken string,
	log *logger.Logger,
	opts ...OrgListenerOption,
) *OrgListener {
	g := &OrgListener{
		OrgUID:      OrgUID,
		botToken:      botToken,
		leaderElector: leaderElector,
		subscriptions: make(map[int64][]chan *TelegramMessage),
		stopped:       make(chan struct{}),
		onError:       func(err error) {},
		log:           log,
	}

	for _, opt := range opts {
		opt(g)
	}

	return g
}

// Subscribe registra un channel para recibir mensajes de un chat específico.
// Retorna una función para cancelar la suscripción.
func (g *OrgListener) Subscribe(chatID int64, ch chan *TelegramMessage) func() {
	g.mu.Lock()
	g.subscriptions[chatID] = append(g.subscriptions[chatID], ch)
	g.mu.Unlock()

	return func() {
		g.mu.Lock()
		defer g.mu.Unlock()
		subs := g.subscriptions[chatID]
		for i, c := range subs {
			if c == ch {
				g.subscriptions[chatID] = append(subs[:i], subs[i+1:]...)
				break
			}
		}
		if len(g.subscriptions[chatID]) == 0 {
			delete(g.subscriptions, chatID)
		}
	}
}

// Start inicia el listener en background. No bloquea.
// Solo hace polling si LeaderElector indica que somos líderes Y hay suscriptores.
// Usa Stop() para detenerlo o Stopped() para esperar a que termine.
func (g *OrgListener) Start(ctx context.Context) {
	// Crear contexto interno que se cancela con Stop() o con el contexto padre
	ctx, g.cancel = context.WithCancel(ctx)

	go g.run(ctx)
}

func (g *OrgListener) run(ctx context.Context) {
	defer func() {
		g.stopOnce.Do(func() {
			close(g.stopped)
		})
	}()

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		// Esperar a que haya suscriptores
		if !g.hasSubscribers() {
			g.debugf("no subscribers, waiting...")
			if err := g.waitForSubscribers(ctx); err != nil {
				return
			}
			continue
		}

		// Esperar a ser líder
		if !g.leaderElector.IsLeader() {
			g.debugf("not leader, waiting...")
			if err := g.waitForLeadership(ctx); err != nil {
				return
			}
			continue
		}

		// Soy líder y hay suscriptores, iniciar polling
		g.debugf("is leader with subscribers, starting polling")
		err := g.runPolling(ctx)

		if ctx.Err() != nil {
			return
		}

		if err != nil {
			g.onError(fmt.Errorf("polling error: %w", err))
		}

		// Si dejamos de ser líder, perdimos suscriptores, o hubo error, el loop reintenta
	}
}

func (g *OrgListener) waitForLeadership(ctx context.Context) error {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if g.leaderElector.IsLeader() {
				return nil
			}
		}
	}
}

func (g *OrgListener) hasSubscribers() bool {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return len(g.subscriptions) > 0
}

func (g *OrgListener) waitForSubscribers(ctx context.Context) error {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if g.hasSubscribers() {
				return nil
			}
		}
	}
}

func (g *OrgListener) runPolling(ctx context.Context) error {
	opts := append([]PollerOption{
		WithDebug(g.debug),
		WithErrorHandler(g.onError),
	}, g.pollerOpts...)

	poller := NewPoller(g.botToken, opts...)

	// Contexto que se cancela si perdemos liderazgo o suscriptores
	pollCtx, cancelPoll := context.WithCancel(ctx)
	defer cancelPoll()

	// Goroutine que monitorea liderazgo y suscriptores
	go func() {
		ticker := time.NewTicker(200 * time.Millisecond)
		defer ticker.Stop()

		for {
			select {
			case <-pollCtx.Done():
				return
			case <-ticker.C:
				if !g.leaderElector.IsLeader() {
					g.debugf("lost leadership, stopping polling")
					cancelPoll()
					return
				}
				if !g.hasSubscribers() {
					g.debugf("no subscribers left, stopping polling")
					cancelPoll()
					return
				}
			}
		}
	}()

	// Goroutine para distribuir mensajes
	go g.distributeMessages(pollCtx, poller.Messages())

	// Iniciar polling (bloquea hasta error o cancelación)
	return poller.Start(pollCtx)
}

func (g *OrgListener) distributeMessages(ctx context.Context, messages <-chan *TelegramMessage) {
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-messages:
			if !ok {
				return
			}
			g.routeMessage(msg)
		}
	}
}

func (g *OrgListener) routeMessage(msg *TelegramMessage) {
	g.mu.RLock()
	subs := g.subscriptions[msg.ChatID]
	g.mu.RUnlock()

	if len(subs) == 0 {
		g.debugf("no subscribers for chat %d, message dropped", msg.ChatID)
		return
	}

	for _, ch := range subs {
		select {
		case ch <- msg:
		default:
			g.debugf("subscriber channel full for chat %d, message dropped", msg.ChatID)
		}
	}
}

func (g *OrgListener) debugf(format string, args ...any) {
	if g.debug {
		g.log.Infof("[telegram-Org:%s] "+format+"\n", append([]any{g.OrgUID}, args...)...)
	}
}

// IsLeader retorna si esta instancia es actualmente el líder
func (g *OrgListener) IsLeader() bool {
	return g.leaderElector.IsLeader()
}

// Stop detiene el listener y libera recursos.
// Es seguro llamarlo múltiples veces.
func (g *OrgListener) Stop() {
	if g.cancel != nil {
		g.cancel()
	}

	// Esperar a que Start() termine
	<-g.stopped

	// Cerrar todos los channels de suscriptores
	g.mu.Lock()
	for chatID, subs := range g.subscriptions {
		for _, ch := range subs {
			close(ch)
		}
		delete(g.subscriptions, chatID)
	}
	g.mu.Unlock()

	g.debugf("stopped")
}

// Stopped retorna un channel que se cierra cuando el listener se detiene
func (g *OrgListener) Stopped() <-chan struct{} {
	return g.stopped
}
