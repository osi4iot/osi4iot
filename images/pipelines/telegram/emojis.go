package telegram

type Emoji struct {
	Name        string
	Emoji       string
	Description string
}

type EmojisMap map[string]Emoji

var emojis = EmojisMap{
	"alert": {
		Name:        "Alert",
		Emoji:       "🚨",
		Description: "This is a universally recognized emoji as an alert or emergency signal.",
	},
	"warning": {
		Name:        "Warning",
		Emoji:       "⚠️",
		Description: "This emoji is used to indicate a warning or caution.",
	},
	"fire": {
		Name:        "Fire",
		Emoji:       "🔥",
		Description: "This emoji is used to indicate a fire or high temperature.",
	},
	"lightning": {
		Name:        "Lightning",
		Emoji:       "⚡",
		Description: "This emoji is used for alerts related to electricity or fast-moving events.",
	},
	"explosion": {
		Name:        "Explosion",
		Emoji:       "💥",
		Description: "This emoji is used for critical situations or serious faults.",
	},
	"red_circle": {
		Name:        "Red Circle",
		Emoji:       "🔴",
		Description: "This emoji is used to indicate a critical condition or shutdown.",
	},
	"megaphone": {
		Name:        "Megaphone",
		Emoji:       "📢",
		Description: "This emoji is used for important announcements.",
	},
	"exclamation_mark": {
		Name:        "Exclamation Mark",
		Emoji:       "❗",
		Description: "This emoji is used to highlight importance.",
	},
	"sos_signal": {
		Name:        "SOS Signal",
		Emoji:       "🆘",
		Description: "This emoji is used for serious emergencies.",
	},
	"stop_sign": {
		Name:        "Stop Sign",
		Emoji:       "🛑",
		Description: "This emoji is used to indicate that something should stop immediately.",
	},
	"prohibited": {
		Name:        "Prohibited",
		Emoji:       "🚫",
		Description: "This emoji is used to indicate actions that are not permitted.",
	},
	// Good condition/normal operation emojis
	"OK": {
		Name:        "OK",
		Emoji:       "✅",
		Description: "This emoji indicates successful verification or good status.",
	},
	"check_mark": {
		Name:        "Check Mark",
		Emoji:       "✅",
		Description: "This emoji indicates successful verification or good status.",
	},
	"green_circle": {
		Name:        "Green Circle",
		Emoji:       "🟢",
		Description: "This emoji indicates normal operation or good condition.",
	},
	"thumbs_up": {
		Name:        "Thumbs Up",
		Emoji:       "👍",
		Description: "This emoji indicates approval or good performance.",
	},
	"ok_hand": {
		Name:        "OK Hand",
		Emoji:       "👌",
		Description: "This emoji indicates perfect or optimal condition.",
	},
	"rocket": {
		Name:        "Rocket",
		Emoji:       "🚀",
		Description: "This emoji indicates high performance or optimal operation.",
	},
	"sparkles": {
		Name:        "Sparkles",
		Emoji:       "✨",
		Description: "This emoji indicates excellent condition or clean operation.",
	},
	"battery_full": {
		Name:        "Battery Full",
		Emoji:       "🔋",
		Description: "This emoji indicates full power or good energy levels.",
	},
	"muscle": {
		Name:        "Flexed Biceps",
		Emoji:       "💪",
		Description: "This emoji indicates strength or system robustness.",
	},
	"heart": {
		Name:        "Heart",
		Emoji:       "❤️",
		Description: "This emoji indicates health or vital system functioning correctly.",
	},
	"trophy": {
		Name:        "Trophy",
		Emoji:       "🏆",
		Description: "This emoji indicates exceptional performance or achievement.",
	},
	"star": {
		Name:        "Star",
		Emoji:       "⭐",
		Description: "This emoji indicates high quality or rated performance.",
	},
	// Warning/intermediate condition emojis
	"yellow_circle": {
		Name:        "Yellow Circle",
		Emoji:       "🟡",
		Description: "This emoji indicates caution or suboptimal functioning that requires attention.",
	},
	"orange_circle": {
		Name:        "Orange Circle",
		Emoji:       "🟠",
		Description: "This emoji indicates a malfunction or degraded operation without being a critical alert.",
	},
	// Unknown status emojis
	"Unknown": {
		Name:        "Unknown",
		Emoji:       "❓",
		Description: "This emoji indicates an unknown status or that the system is offline.",
	},
}

func GetEmoji(key string) string {
	emoji, exists := emojis[key]
	if !exists {
		return emojis["Unknown"].Emoji
	}
	return emoji.Emoji
}
