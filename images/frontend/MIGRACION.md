# Actualización del frontend (octubre 2026)

Actualización completa de todas las dependencias del servicio `frontend` a su última versión, con las
adaptaciones de código necesarias. Esto se ha verificado:

- `pnpm install --frozen-lockfile` + `pnpm build` en una copia limpia (lo mismo que hace el `Dockerfile`).
- `pnpm typecheck` (TypeScript 7): sin errores nuevos. Solo queda un error previo, descrito en «Problemas previos».
- `pnpm test` (Vitest): 11 tests nuevos de tablas, modales y datepicker.
- Pruebas en Chromium real (WebGL) comparando **la versión antigua y la nueva lado a lado** con los mismos datos:
  visor 3D (modelo glTF, panel dat.gui, selección por clic, resaltado), escala de colores FEM y leyenda,
  vista Pipeline (React Flow, editor con autocompletado y diagnósticos TypeScript), login y rutas protegidas,
  tablas (paginación, orden, filtros, filtro global), modales, mapa Leaflet, tutorial PDF, cámara y NATS
  (contra un `nats-server` real).

## Versiones principales

| Paquete | Antes | Ahora |
|---|---|---|
| react / react-dom | 17.0.2 | 19.3.1 |
| three / @types/three | 0.137.5 / 0.134 | 0.186.1 / 0.186 |
| @react-three/fiber | 7.0 | 9.8 |
| @react-three/drei | 8.8 | 10.7 |
| react-router-dom 5 | 5.2 | **react-router 8.5** (react-router-dom ya no existe) |
| react-table | 7.7 | **@tanstack/react-table 9.3** |
| styled-components | 5.3 | 6.6 |
| react-leaflet | 3.2 | 5.0 |
| react-pdf | 5.7.2 | 11.0 (pdfjs-dist 6.3) |
| react-toastify | 7 | 11 |
| react-select | 4 | 5 |
| react-datepicker | 4 | 9 |
| react-loader-spinner | 4 | 8 |
| use-file-picker | 1 | 2 |
| yup | 0.32 | 1.7 |
| nats.ws (deprecado) | 1.30 | **@nats-io/nats-core 3.4** |
| @turf/* | 6.5 | 7.4 |
| typescript | 6.0 | 7.0 (nativo) + `@typescript/typescript6` para el editor del Pipeline |
| three-stdlib | 2.6 | eliminado (GLTFLoader oficial de three) |
| vite / plugin-react | 8.0 | 8.3 / 6.1 |
| express / http-proxy-middleware (proxy dev) | 4 / 2 | 5 / 4 |
| Tests | react-scripts + jest (no funcionaban) | Vitest 5 + Testing Library 16 + jsdom |

Se han eliminado los `@types/*` que ya incluyen las propias librerías, `web-vitals` y `@types/react-speech-kit`
(no se usaban), y el fichero de tipos de react-table v7 (`src/types/react-table-config.d.ts`).

## Cambios por área

### React 19
- `src/index.tsx`: `ReactDOM.render` → `createRoot`.
- **Se ha quitado `<React.StrictMode>`**. En React 18+ hace montar → desmontar → montar cada componente en
  desarrollo, y varios efectos de la app no están preparados (conexiones MQTT/NATS, workers,
  `URL.revokeObjectURL` del glTF). React 17 no lo hacía, así que quitarlo mantiene el comportamiento.
  Puede reactivarse cuando esos efectos sean idempotentes.
- Tipos: `JSX.Element` global → `ReactNode`/`React.JSX`. `ChildrenProp.children` ahora es opcional.

### three.js r186 + React Three Fiber 9 + drei 10
- `outputEncoding/sRGBEncoding` → `outputColorSpace/SRGBColorSpace`; `texture.encoding` → `texture.colorSpace`
  (`loadAndParseGltfFile.ts`).
- `physicallyCorrectLights` ya no existe: las luces físicas son ahora el modo por defecto (la app ya lo usaba).
- `shadows="percentage"`: three r186 eliminó `PCFSoftShadowMap` (usaba PCF de todos modos).
- Se eliminan los apaños `const GroupComponent = 'group' as any`: ahora se usan `<group>`, `<mesh>`,
  `<primitive>` y las luces con sus tipos reales, así que el código 3D vuelve a tener comprobación de tipos.
- `THREE.Event` (tipo eliminado) y el namespace global `THREE` (antes lo exponían los tipos antiguos) → import explícito.
- **Gestión de color**: three ≥ r152 interpreta los colores hexadecimales definidos en el código como sRGB.
  Con el mismo modelo glTF, la comparación lado a lado da imágenes prácticamente idénticas. La escala FEM sale
  algo más saturada en los extremos, y ahora coincide mejor con la leyenda. Para recuperar exactamente el
  aspecto antiguo, pon `LEGACY_COLOR_MANAGEMENT = true` en `DigitalTwin3DViewer/Utils/constants.ts`.
- `react-dat-gui` (sin mantenimiento) se ha eliminado: el panel de control es ahora el **inspector acoplado**
  (ver más abajo) con componentes propios, y ya no hace falta el alias de `vite.config.ts`.
- **Materiales glTF**: `changeMaterialPropRecursively` respeta ahora las propiedades originales del glTF, que se
  guardan al cargar (`userData.gltfOriginal`): materiales `BLEND` (transparencia y depthWrite), alfa del color base y
  color emisivo propio. Antes se forzaban a opaco y sin emisión, lo que producía los cuadrados negros en las chispas
  de soldadura y apagaba los pilotos de los paneles.
- **Animaciones Blender**: el clip de un nodo se busca también como `<clipName>_<nodo>` (o por las pistas que animan
  ese nodo), porque el exportador de Blender nombra los clips "Acción_Objeto" (`SPARKS_01Action_SPARKS_01`).
- **Selección con el ratón**: `ViewerUtils` guarda las refs de la barra Name/Type/Collection y no los elementos
  (se volvían obsoletos al cambiar entre 3D y Pipeline), y `Model` toma el canvas de `useThree().gl.domElement`.
- Aviso inofensivo en consola: `THREE.Clock: This module has been deprecated` (viene de R3F 9).

### react-router 8
- `Switch`/`Redirect`/`useHistory` → `Routes`/`Navigate`/`useNavigate`. Las rutas protegidas
  (`PrivateRoute`, `PrivateRouteWithUserRole`, `PublicRoute`) son ahora envoltorios de elementos.
- `NavLink exact` → `end`.
- **Corrección de comportamiento**: react-router 7+ hace las navegaciones dentro de `startTransition`. Por eso,
  tras iniciar sesión desde una ruta protegida, el `<Navigate to="/">` de `PublicRoute` ganaba al
  `navigate(from)` del login y se acababa en `/` en lugar de volver a la página pedida. `PublicRoute` ahora
  respeta `state.from`.

### Tablas: react-table v7 → TanStack Table v9
- Nuevo módulo `PlatformAssistant/Utils/platformTable.tsx` con las *features* de TanStack v9 y una capa de
  compatibilidad. **Las ~30 definiciones de columnas (`TableColumns/`) no se han tocado**: siguen con el formato
  v7 (`Header`, `accessor`, `Cell`, `filter`, `disableFilters`, `disableSortBy`) y se convierten
  a `ColumnDef` v9. Solo ha cambiado su import (`Column` sale ahora de `platformTable`).
- Se reproduce la semántica de v7: filtro por defecto «contiene» sin mayúsculas, `filter: 'equals'` con `==`,
  orden alfanumérico ascendente primero, filtro global (con debounce de 200 ms) sobre todas las columnas,
  vuelta a la página 1 al ordenar o filtrar, y las mismas props en los `Cell` (`row.id`, `row.index`,
  `row.original`, `row.cells[n].value`, `rows`...).
- Las tres tablas (`TableWithPagination`, `TableWithPaginationAndRowSelection`, `TableWithPaginationAsync`)
  están reescritas con la API v9 y mantienen el mismo marcado y estilos.
- Pequeña mejora: hacer clic en el campo de filtro de una cabecera ya no cambia la ordenación (en v7 sí).
- Si se vuelven a crear las columnas en cada render (`Create_X_COLUMNS(refresh)` en línea), la tabla ya no
  remonta las celdas ni pierde la página: usa siempre la última versión de los `Cell`.

### styled-components 6
- v6 ya no filtra las props personalizadas antes de pasarlas al DOM. Se restablece el comportamiento de v5
  con un `StyleSheetManager` global (`src/styledComponentsConfig.ts` + `@emotion/is-prop-valid`).
- **Selectores anidados**: en v6, `:hover`, `:nth-child(...)` o `::-webkit-scrollbar` sin `&` pasan a ser
  selectores *descendientes*. Se han corregido 178 selectores en 44 ficheros (`:x` → `&:x`): rayado de
  filas de las tablas, barras de scroll personalizadas, barras de progreso...

### Otras librerías
- **react-toastify 11**: tema `colored` sin iconos (success verde, error rojo, warning amarillo, info azul). El tema
  se fija en un envoltorio porque styled-components reserva la prop `theme` y no la reenvía. El CSS se inyecta solo.
- **react-pdf 11**: el worker de pdf.js se sirve desde el bundle (antes CDN de cdnjs). Se usa
  `suspense={false}` para conservar el loader y el mensaje de error: con Suspense, un fallo al cargar el PDF
  desmontaba la app. Se importa `TextLayer.css`.
- **react-loader-spinner 8**: adaptador `Tools/OvalSpinner.tsx` (los loaders ya no aceptan `className` ni `type`).
- **react-select 5**: `OptionsType`/`ValueType` → `Options`/`SingleValue`.
- **react-datepicker 9**: `onChange` recibe `Date | null`; `dayClassName` devuelve cadena.
- **use-file-picker 2**: devuelve un objeto (`openFilePicker`, `filesContent`...) en lugar de una tupla.
- **yup 1**: `when(..., { then: Yup.string()... })` → `then: (schema) => schema...`; `oneOf([ref, null])` → `oneOf([ref])`.
- **react-html5-camera-photo**: solo publica un build CJS y su import por defecto llegaba como objeto (la cámara
  móvil no se mostraba). Se resuelve el componente en `MobilePhotoForm.tsx`.
- **NATS**: `nats.ws` está deprecado. Se migra a `@nats-io/nats-core` v3 (`connect` → `wsconnect`). v3 eliminó
  `StringCodec`, así que hay un equivalente en `src/tools/natsCodec.ts` con la misma API.
- **Editor del Pipeline**: TypeScript 7 es un binario nativo sin API en JavaScript. El language service del
  worker usa `@typescript/typescript6` (paquete oficial de Microsoft).
- **Proxy de desarrollo** (`server.js`): pasa a ESM (`"type": "module"` en `package.json`), Express 5 y
  http-proxy-middleware 4 (`logLevel` → `logger`).
- **Tests**: `pnpm test` (Vitest + jsdom). Nuevo script `pnpm typecheck`.

## Fidelidad del visor 3D frente a un visor glTF de referencia

Objetivo: que un modelo que se ve bien en https://gltf-viewer.donmccurdy.com/ también se vea bien en la plataforma.
Se ha comparado la escena que dibuja la plataforma con la de un visor three.js «puro» (GLTFLoader oficial, todos
los clips en bucle), malla a malla (dibujada, material, textura, color, emisión, transparencia, transmisión,
esqueleto, morph targets, luces) y comprobando que cada nodo animado se mueve. Modelos usados: ROBTRUSION,
Water_heater, Portico biempotrado, losa_composites, robotic_arm_welding y variantes de prueba (Draco, Meshopt,
materiales sin nombre, morph targets). Resultado: todos coinciden con la referencia salvo las diferencias por diseño
indicadas abajo.

Corregido:
- **Modelos comprimidos**: cargador común `src/tools/gltfLoader.ts` (GLTFLoader oficial de three con Draco,
  Meshopt y KTX2/Basis). El plugin `three-decoders` de `vite.config.ts` sirve los decodificadores en desarrollo
  y los copia a la build en `/libs/draco/` y `/libs/basis/`. Lo usan el visor y los formularios de crear/editar
  gemelo digital. Ya no se usa `three-stdlib`.
- **Materiales sin nombre o con nombre repetido**: antes se perdían y esos objetos recibían un material por defecto
  (sin textura). Ahora se guardan todos.
- **Materiales compartidos entre objetos**: cada objeto de primer nivel recibe sus propias copias (las texturas siguen
  compartidas). Antes, al resaltar un objeto con el ratón se iluminaban también todos los que compartían material
  (en el robot de soldadura, `Metal_Paint_1` lo comparten 5 objetos).
- **Escena raíz sin nombre "Scene"**: `sortObjects` recibe la escena del glTF; antes el visor se caía.
- **Animaciones sin metadatos de la plataforma**: los clips que ningún nodo declara (`clipName`) se reproducen en
  bucle, como en cualquier visor glTF. Si un clip anima varios objetos se reparte entre ellos (misma duración, siguen
  sincronizados). No se aplican a mallas FEM ni a nodos que la plataforma anima con datos (`animationType`).
  Los clips declarados funcionan igual que antes (incluidos los controlados por sensores).
- **Activos y sensores** animan también los clips de sus descendientes (antes solo con `clipName` en el propio
  objeto, y los sensores solo el primer clip). La velocidad de los sensores con `clipValue` se mantiene como estaba
  (`clipValue` como avance por fotograma, a diferencia de activos y genéricos, que usan `delta × clipValue`):
  conviene revisarlo, pero cambiarlo alteraría modelos ya calibrados.
- **Objetos de un solo nivel**: se dibuja el objeto original del glTF en lugar de una copia de su geometría. Así se
  conservan morph targets, esqueletos, luces glTF (`KHR_lights_punctual`) y el nombre (necesario para enlazar sus
  animaciones).
- Ya no se fuerza `transparent` en los objetos con animación sin fin (empeoraba el orden de dibujado); la
  transparencia propia del glTF se conserva.
- El marcador HTML de los sensores se coloca en la posición del sensor (en los sensores agrupados aparecía en el
  origen de la escena).

Diferencias que se mantienen por diseño: mallas FEM (solo con resultados), objetos con `defaultObjectOnOff: off` o
`visible: false`, opacidad de los metadatos (`opacity`), animaciones `blenderTemporary` controladas por datos de
sensores, e iluminación y encuadre propios del visor (luces de escena, HDR, exposición y cámara ajustada a la escena).

No soportado (tampoco en gltf-viewer): ficheros STL u otros formatos que no sean glTF/GLB. Un STL es geometría sin
materiales ni jerarquía; hay que exportar el modelo a glTF/GLB (por ejemplo, desde Blender).

## Inspector del visor 3D (sustituye a react-dat-gui)
- Panel fijo a la derecha (`DigitalTwin3DViewer/Inspector/`) con pestañas: Scene, Sensors, Assets, Objects, FEM,
  Simulator y System. Solo aparecen las que tienen contenido en el modelo. Recuerda la pestaña y las secciones
  abiertas al cerrarlo y volver a abrirlo.
- Controles propios (`Inspector/controls.tsx`): interruptor, deslizador con valor editable (clic en el número
  para escribirlo; se ajusta al rango y al paso), desplegable, secciones plegables con el interruptor de la luz
  en la cabecera y filas de colección con tres iconos (resaltar, marcador de sensor, ocultar) y la opacidad al
  desplegarlas. Accesibles con teclado.
- Cada cambio produce una copia profunda de las opciones, igual que hacía react-dat-gui, para no alterar los
  efectos del modelo que dependen de los objetos anidados.
- Barra superior nueva: nombre del gemelo digital, selector 3D model / Pipeline / Image, herramientas de cada
  vista, estados (pipeline, gemelo digital, NATS) como etiquetas y botón del inspector. El chat y los logs se
  abren debajo de la barra, dentro del área del visor.
- Corregido (venía de antes): el interruptor de la luz ambiente no hacía nada (escribía `ambientLigth`).
- Ventana del simulador ("Digital twin simulator") con el mismo diseño: se arrastra por la cabecera, valor
  editable, botones − / +, mínimo y máximo, restablecer valores y "Stop simulation" (Esc también la cierra).
- Escena › Environment › "Axes length": escala la longitud de las líneas de los ejes (0,1× – 10×); las puntas de
  flecha mantienen su tamaño. Los ejes ya no se recrean en cada render.

## Editor de pipelines
- **Copiar / cortar / pegar** (Ctrl+C, Ctrl+X, Ctrl+V; Cmd en macOS) los nodos seleccionados y las conexiones
  entre ellos. Se copia al portapapeles del sistema en el mismo YAML de "Download YAML", así que se puede pegar
  en otro gemelo digital, en otra pestaña o en un editor de texto, y pegar un YAML copiado de un fichero.
  Los nodos pegados reciben uids nuevos, nombres únicos ("Function 1" → "Function 3") e `injectRef` libres;
  se respeta el máximo de 5 Inject y las restricciones de AI Agent/Telegram de la organización y el grupo.
- **Deshacer / rehacer** (Ctrl+Z, Ctrl+Y o Ctrl+Shift+Z): añadir, mover, borrar, conectar, pegar, importar y
  editar propiedades. El historial guarda 100 pasos y se reinicia al cambiar de gemelo digital.
- **Upload YAML** y **pegar**: los nodos aparecen seleccionados y siguen al ratón; un clic los deja en su
  sitio, y Esc (o el botón derecho) cancela.
- Al seleccionar grupos de nodos ya no se selecciona el texto de las etiquetas.
- Los atajos no actúan mientras se escribe en un campo de texto o en el editor de código.
- Corregido (venía de antes): "Download YAML" perdía las conexiones creadas a mano en el editor (React Flow les
  da ids `xy-edge__…`) y el número de salidas de los nodos sin conectar. Ahora también guarda `debug`.

- El estado del pipeline (icono Status) ya no parpadea ni alterna entre Unknown y Running cuando varias réplicas
  contestan a la vez: un "unknown" no sustituye a un estado conocido recibido en los últimos 5 s y, si llega
  antes, se aplica con 1,5 s de retraso (se cancela si llega el estado conocido). Un valor desconocido se
  muestra como Unknown en vez de hacer desaparecer el icono.
- "Deploy changes" (la primera vez) ya no devuelve el visor a "3D Model": recargar las tablas de la plataforma
  ya no desmonta el visor, y si se vuelve a montar recupera la vista activa.
- El editor de pipelines funciona aunque no haya grupo/organización seleccionados en el mapa (se toman de las
  tablas a partir del gemelo digital). Un error en el editor se queda en el editor (con botón Retry) y ya no
  muestra "It can not initialize the 3D viewer"; ese mensaje solo aparece si el error es de WebGL, junto al
  texto del error.

## Gestión del estado (TanStack Query + Zustand)
Antes, todo el estado vivía en `PlatformAssistantContext` (una caché de tablas hecha a mano, con indicadores
`reloadXxxTable`) y en `useState`/contextos montados dentro de cada capa, así que al cambiar de capa
(`/platform_assistant`, `/user`, `/group`, `/org`, `/admin`) se perdía. Ahora todo está en `src/state/`:

- **Datos del servidor → TanStack Query** (`tables.ts`, `tableResources.ts`).
  - `useTable("sensors")` devuelve la tabla (array vacío mientras carga).
  - `useTablesPending([...])` es la pantalla de carga de la capa: solo aparece la primera vez.
  - `reloadTable("sensors")` sustituye a `setReloadSensorsTable(dispatch, { reloadSensorsTable: true })`.
  - Las tablas se comparten entre capas: al volver a una capa se ven al instante y, si tienen más de 30 s,
    se refrescan en segundo plano. Cada tabla se pide una sola vez aunque la usen varias capas.
  - En `tableResources.ts` está la URL y la preparación de cada tabla, que antes estaban repetidas en las
    cinco capas. Los edificios y las plantas de la capa del administrador de la plataforma son todos
    (`LayerScopeProvider scope="admin"` en la página); antes compartían el mismo hueco con los de los grupos
    gestionados y se mostraban unos u otros según qué capa se hubiera visitado primero.
  - Una tabla que falla se muestra vacía (antes la pantalla de carga se quedaba girando).
- **Estado de la interfaz → Zustand.**
  - `usePersistentState("group.optionToShow", ...)` funciona como `useState`, pero sobrevive al cambiar de
    capa. Se usa para la sección abierta de cada capa y, en la capa principal, para las selecciones del mapa
    (edificio, planta, organización, grupo, activo, sensor, gemelo digital), los límites del mapa y el visor
    3D abierto.
  - Los 18 contextos de sección (`contexts/sensorsOptions`, `groupsManagedOptions`...) son ahora almacenes
    Zustand (`createSectionStore`) que reutilizan sus reducers y acciones. Con eso se conserva la pantalla de
    cada sección (tabla, crear, pasos intermedios). Al volver a un formulario de **edición** se vuelve a la
    tabla, porque esos formularios localizan el elemento por su posición en la tabla y esta puede haber
    cambiado.
  - `sessionStore.ts` guarda el rol del usuario y las pestañas de dashboards abiertas.
  - `viewerMemoryStore.ts` guarda, por gemelo digital, lo que el usuario tenía en el visor: vista activa,
    opciones del inspector, pipeline sin desplegar y logs. Al volver se recupera todo. El modelo 3D se
    reutiliza sin volver a descargarlo; `sortObjects` es ahora repetible con el mismo modelo.
- Nada se guarda al recargar la página. Al cerrar sesión (botón o token caducado) se vacía todo
  (`resetAllState` en `logout`).
- Corregido de paso:
  - Al soltar un nodo de la paleta en el pipeline no se marcaba como cambio sin desplegar.
  - El interceptor de axios que renueva el token se añadía de nuevo en cada petición; ahora se registra una
    sola vez.
  - Cada visita a la capa principal creaba un worker nuevo para los resultados FEM; ahora hay uno solo.

## Menú lateral y barra superior (diseño adaptable)
- La barra vertical de iconos, las pestañas horizontales de cada capa y el título de cada página
  ("Platform assistant", "Platform assistant for groups admin"...) se sustituyen por un **menú lateral** con
  todas las capas y sus secciones (`components/Layout/PlatformAssistantLayout.tsx` y `platformAssistantNav.ts`).
  - Solo aparecen las capas que permite el rol del usuario (igual que antes).
  - Cada capa se despliega o se pliega; por defecto solo está desplegada la capa en la que se está.
  - Al elegir una sección de otra capa se navega a esa capa directamente en esa sección. La sección abierta de
    cada capa se sigue conservando al cambiar de capa.
  - Con un gemelo digital abierto aparece "Digital twin · nombre" en la capa Home para volver al visor.
  - En escritorio el menú se puede plegar a una columna de iconos (botón arriba a la izquierda; la preferencia
    se recuerda en el navegador). Al pasar el ratón por una capa se muestran sus secciones.
  - En ventanas de menos de 900 px el menú se oculta y se abre como panel deslizante con el botón ☰.
- **Barra superior** nueva con el mismo diseño que la barra del visor y el inspector: logotipo, nombre de la
  plataforma, la capa y la sección abiertas, y el usuario con el botón para cerrar sesión. La usan también el
  resto de páginas (inicio, login, páginas móviles). Sustituye a `Logo.tsx` y `SingInSignOut.tsx`.
- El contenido ocupa todo el espacio libre. Los formularios y tablas que calculaban su altura con
  `calc(100vh - Npx)` usan la variable CSS `--pa-gain` para aprovechar el espacio ganado; los formularios de
  ancho fijo (400 px) se estrechan en pantallas pequeñas.
- El panel de propiedades de los nodos del pipeline y los valores máximo/mínimo FEM estaban colocados con
  posiciones fijas respecto a la ventana; ahora se colocan dentro del visor.
- Eliminado el botón de las herramientas de TanStack Query (y la dependencia `@tanstack/react-query-devtools`).

## Formularios, tablas y editor de pipelines adaptables
- **Formularios de crear / editar** (todas las secciones): dejan de tener ancho fijo (400 px o arrastrar el
  borde). La tarjeta del formulario ocupa todo el ancho y alto libres (`FormCard` en `Tools/FormTools.tsx`;
  `DraggableFormContainer` y `StaticFormContainer` son ahora alias suyos y los formularios con contenedor
  propio usan el mismo).
  - Los campos se reparten en columnas de al menos 300 px según el ancho (`ControlsContainer`); en el móvil
    queda una sola columna. El orden en la rejilla es:
    1. Los campos sencillos (etiqueta + entrada o desplegable), en filas alineadas.
    2. En una fila nueva, los recuadros con título ("Pipeline", "Asset location and icon size", "Topic
       references", "Group admins", "Telegram bot"...), uno al lado de otro. Cada recuadro y su título forman
       un solo bloque (`FormSection`).
    3. A todo el ancho, los campos grandes: editores de código, áreas de texto, mapas, tablas y filas de
       campos. Cualquier campo puede pedirlo con el atributo `data-wide`.
  - Botones Cancel / Submit abajo a la derecha (a todo el ancho en el móvil); "Cancel" ya no envía el
    formulario. El título del formulario se alinea a la izquierda con la tarjeta.
  - Las filas de campos (`InputArrayRows`, p. ej. usuarios) tienen columnas fluidas y, si no caben, cada fila
    se muestra como una tarjeta con sus etiquetas.
  - Los pasos de selección en tabla (seleccionar organización, sensor, topic, usuarios...) usan la misma
    tarjeta y botones.
- **Tablas** (`TableWithPagination`, `...AndRowSelection`, `...Async`; estilos en `Utils/responsiveTable.ts`):
  - Ocupan todo el ancho; si las columnas no caben se desplazan en horizontal dentro de su recuadro.
  - Cuando el espacio de la tabla baja de 760 px (consulta de contenedor, también con el menú abierto) cada
    fila se muestra como una tarjeta "columna: valor", con los iconos de acción juntos abajo a la derecha. En
    esta vista no se muestran los filtros por columna (sí el buscador global).
  - La barra de paginación, buscador y botón "New ..." se reparte en varias líneas si no cabe.
- **Editor de pipelines**:
  - El lienzo y el panel de propiedades empiezan debajo de la barra del visor, que en esta vista ocupa el
    ancho a la derecha de la paleta: ya no hay nodos tapados por la barra (aunque ocupe varias líneas).
  - La paleta de nodos se puede plegar a una columna de iconos (botón en su cabecera; el nombre y la
    descripción del nodo aparecen al pasar el ratón). Se pliega sola cuando el editor mide menos de 760 px,
    salvo que el usuario la haya desplegado.
  - El panel de propiedades no sobrepasa el ancho disponible.
- Corregido: una tabla cuya petición fallaba hacía que la sección entrara en un bucle de pantalla de carga
  y peticiones (la consulta fallida se volvía a pedir al montar la sección). Ahora se muestra vacía y solo
  se vuelve a pedir al recargarla.
- Corregido: "Create floor" fallaba si no había ningún edificio.
- Corregido: en "Create group", los usuarios elegidos con "Select user" no aparecían en "Group admins". El
  formulario se montaba con los datos anteriores y la selección se añadía después. Además, al volver de
  "Select user" o "Select space" la organización elegida ya no se cambia por la primera de la lista.

## Página de inicio con escena 3D interactiva
- La imagen fija (`osi4iot_fond.jpg`) se sustituye por una escena 3D (`components/HomeHero/HeroScene.tsx`,
  React Three Fiber, con bloom de `@react-three/postprocessing`). Muestra un aerogenerador real y su gemelo
  digital. Los sensores IoT del aerogenerador envían sus medidas, como flujos de partículas, a un núcleo de
  IA (una red neuronal) y de ahí al gemelo. Todo está sobre una planta hexagonal que representa la
  Industria 4.0.
  - Arrastrar gira la cámara. La rueda del ratón no hace zoom, para no bloquear el desplazamiento.
  - Al pasar el ratón por un sensor se ve su medida simulada: rotor, temperatura, vibración y potencia.
  - Un clic en el aerogenerador lanza una ráfaga de viento:
    - el rotor se acelera y las medidas suben;
    - los datos viajan más rápido y el núcleo de IA reacciona;
    - el gemelo reproduce el giro con un pequeño retardo de sincronización;
    - el suelo muestra ondas.
  - Resultados FEM en el gemelo:
    - la torre y las palas se colorean según la tensión de von Mises, con la escala azul-rojo del visor;
    - la torre se deforma con el empuje del viento;
    - una leyenda "Von Mises [Pa]" muestra la escala completa, de 0 al máximo, con cinco marcas en notación
      científica (como la del visor), y se actualiza en tiempo real.
    Con la ráfaga, la tensión y la deformación aumentan.
  - Los botones "Digital twins", "IoT", "Industry 4.0", "AI" y "FEM results" resaltan su parte de la escena
    y la explican. "FEM results" muestra los colores opacos y exagera la deformación.
- La escena se carga aparte (lazy), así que no retrasa el resto de la aplicación.
- Si el navegador no tiene WebGL o la escena falla, se muestra la imagen de antes.
- Con "reducir movimiento" activado en el sistema no hay entrada animada, giro automático, ráfaga inicial ni
  partículas de fondo. La escena se queda quieta salvo cuando el usuario lanza una ráfaga.
- Nueva tipografía de titulares: Archivo (`@fontsource-variable/archivo`, incluida en la aplicación, sin
  servicios externos).
- Menú lateral plegado: el menú flotante de una capa se cierra al sacar el ratón y al elegir una sección.
  Antes se quedaba abierto mientras el botón conservaba el foco.
- Editor de pipelines: "Nats listen" usa ahora una antena parabólica (recibe) y "Nats publish" una torre
  de emisión (publica). Antes tenían el mismo icono.

## Qué conviene probar a mano (necesita backend real)
1. Visor 3D con un gemelo digital real **con resultados FEM**: colores de la escala, deformación, workers
   con SharedArrayBuffer, animaciones.
2. Mapa de geolocalización con datos reales (edificios, plantas, sensores y activos).
3. Simulador de gemelo digital y formularios de sensores móviles (NATS/MQTT reales).
4. Asistente de chat con voz (react-speech-recognition 4; su API es la misma).

## Problemas previos detectados (no causados por la actualización)
- `src/components/Tools/DigitalTwinSimulatorOptions.tsx` es una copia casi exacta de
  `DigitalTwinSimulatorSelectForm.tsx`: exporta el formulario de selección y no acepta `mqttClient`. En
  `DigitalTwinSimulatorMobilePage`, el segundo paso del simulador muestra el componente equivocado. Es el
  único error de TypeScript que queda. Parece que el componente original se sobrescribió; habría que recuperarlo.
- `Dockerfile.arm64` está obsoleto (usa yarn, un `yarn.lock` inexistente y la carpeta `build` de CRA). El build
  multiplataforma de `build_image.sh` usa el `Dockerfile` principal, que sí está al día.
- En la versión antigua, `react-speech-recognition` 3 fallaba en desarrollo con
  `regeneratorRuntime is not defined`. La v4 lo corrige.

## Posibles siguientes pasos
- `paho-mqtt` (sin cambios desde 2018) → `mqtt` (MQTT.js).
- Sustituir `react-modal-hook` y `react-html5-camera-photo` (sin mantenimiento desde 2022) por alternativas
  activas (modales propios, `react-webcam`).
- Dividir el bundle con `import()` dinámico (Vite avisa de chunks > 500 kB: three, pdf.js, TypeScript).
