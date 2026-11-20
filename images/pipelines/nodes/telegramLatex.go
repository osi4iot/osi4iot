package nodes

// The mathematics of an answer, for Telegram, which does not show LaTeX.
//
// The AI agent writes formulas in LaTeX ($...$, $$...$$, \(...\), \[...\]): the viewer's chat shows them with
// KaTeX, Telegram would show the LaTeX source. Here they become text:
//   - a formula on one line, as Unicode text: \int_{0}^{2} 3x^{2}\,dx → ∫₀² 3x² dx, \frac{x+1}{2} → (x + 1)/2;
//   - a formula with rows (matrices, systems of equations, aligned equations), as a monospaced block (<pre>)
//     with its columns aligned and tall brackets:
//
//	A = ⎛ 1  2 ⎞      ⎧ 2x + y = 5
//	    ⎝ 3  4 ⎠      ⎩ x − y = 1
//
// Only the LaTeX that answers use is known; anything else is shown as close to its source as possible.

import (
	"html"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

// mathPart is a piece of a text: plain text, or a formula (without its delimiters)
type mathPart struct {
	text    string
	math    bool
	display bool // $$...$$ or \[...\]
}

// splitMath separates the formulas of a text. A single $ opens a formula only if a non-space follows it, and
// closes it only if a non-space precedes it and no digit follows it, so prices ("5$ y 3$") stay text.
func splitMath(s string) []mathPart {
	var parts []mathPart
	var plain strings.Builder
	flush := func() {
		if plain.Len() > 0 {
			parts = append(parts, mathPart{text: plain.String()})
			plain.Reset()
		}
	}
	for i := 0; i < len(s); {
		open, close, display := "", "", false
		switch {
		case strings.HasPrefix(s[i:], "$$"):
			open, close, display = "$$", "$$", true
		case strings.HasPrefix(s[i:], `\[`):
			open, close, display = `\[`, `\]`, true
		case strings.HasPrefix(s[i:], `\(`):
			open, close = `\(`, `\)`
		case strings.HasPrefix(s[i:], `\$`):
			plain.WriteString("$")
			i += 2
			continue
		case s[i] == '$':
			if end := inlineDollarEnd(s, i); end > 0 {
				flush()
				parts = append(parts, mathPart{text: s[i+1 : end], math: true})
				i = end + 1
				continue
			}
		}
		if open != "" {
			if end := strings.Index(s[i+len(open):], close); end >= 0 && strings.TrimSpace(s[i+len(open):i+len(open)+end]) != "" {
				flush()
				parts = append(parts, mathPart{text: s[i+len(open) : i+len(open)+end], math: true, display: display})
				i += len(open) + end + len(close)
				continue
			}
		}
		plain.WriteByte(s[i])
		i++
	}
	flush()
	return parts
}

// inlineDollarEnd: the closing $ of a formula opened by the $ at i, or -1
func inlineDollarEnd(s string, i int) int {
	if i+1 >= len(s) || s[i+1] == ' ' || s[i+1] == '\n' || s[i+1] == '$' {
		return -1
	}
	for j := i + 1; j < len(s); j++ {
		switch s[j] {
		case '\n':
			return -1
		case '\\':
			j++ // \$ inside the formula
		case '$':
			if s[j-1] == ' ' || (j+1 < len(s) && s[j+1] >= '0' && s[j+1] <= '9') {
				return -1
			}
			return j
		}
	}
	return -1
}

// --- a formula on one line ---

var latexSymbols = map[string]string{
	"alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "epsilon": "ϵ", "varepsilon": "ε", "zeta": "ζ",
	"eta": "η", "theta": "θ", "vartheta": "ϑ", "iota": "ι", "kappa": "κ", "lambda": "λ", "mu": "μ", "nu": "ν",
	"xi": "ξ", "pi": "π", "varpi": "ϖ", "rho": "ρ", "varrho": "ϱ", "sigma": "σ", "varsigma": "ς", "tau": "τ",
	"upsilon": "υ", "phi": "ϕ", "varphi": "φ", "chi": "χ", "psi": "ψ", "omega": "ω",
	"Gamma": "Γ", "Delta": "Δ", "Theta": "Θ", "Lambda": "Λ", "Xi": "Ξ", "Pi": "Π", "Sigma": "Σ",
	"Upsilon": "Υ", "Phi": "Φ", "Psi": "Ψ", "Omega": "Ω",
	"cdot": "·", "cdotp": "·", "times": "×", "div": "÷", "pm": "±", "mp": "∓", "ast": "∗", "star": "⋆",
	"circ": "∘", "bullet": "•", "oplus": "⊕", "otimes": "⊗",
	"le": "≤", "leq": "≤", "ge": "≥", "geq": "≥", "ne": "≠", "neq": "≠", "approx": "≈", "equiv": "≡",
	"sim": "∼", "simeq": "≃", "cong": "≅", "propto": "∝", "ll": "≪", "gg": "≫",
	"infty": "∞", "partial": "∂", "nabla": "∇", "int": "∫", "iint": "∬", "iiint": "∭", "oint": "∮",
	"sum": "∑", "prod": "∏", "coprod": "∐",
	"to": "→", "rightarrow": "→", "leftarrow": "←", "gets": "←", "leftrightarrow": "↔", "Rightarrow": "⇒",
	"Leftarrow": "⇐", "Leftrightarrow": "⇔", "iff": "⇔", "implies": "⇒", "impliedby": "⇐", "mapsto": "↦",
	"longrightarrow": "⟶", "Longrightarrow": "⟹", "uparrow": "↑", "downarrow": "↓",
	"in": "∈", "notin": "∉", "ni": "∋", "subset": "⊂", "subseteq": "⊆", "supset": "⊃", "supseteq": "⊇",
	"cup": "∪", "cap": "∩", "setminus": "∖", "emptyset": "∅", "varnothing": "∅", "forall": "∀", "exists": "∃",
	"nexists": "∄", "neg": "¬", "lnot": "¬", "land": "∧", "wedge": "∧", "lor": "∨", "vee": "∨",
	"angle": "∠", "degree": "°", "perp": "⊥", "parallel": "∥", "mid": "∣",
	"ldots": "…", "dots": "…", "cdots": "⋯", "vdots": "⋮", "ddots": "⋱", "prime": "′",
	"langle": "⟨", "rangle": "⟩", "lfloor": "⌊", "rfloor": "⌋", "lceil": "⌈", "rceil": "⌉",
	"lvert": "|", "rvert": "|", "vert": "|", "lVert": "‖", "rVert": "‖", "Vert": "‖",
	"hbar": "ℏ", "ell": "ℓ", "Re": "ℜ", "Im": "ℑ", "aleph": "ℵ", "therefore": "∴", "because": "∵",
	"checkmark": "✓", "square": "□", "triangle": "△",
}

// functions written upright: their name, a space before a variable
var latexFunctions = map[string]bool{
	"sin": true, "cos": true, "tan": true, "cot": true, "sec": true, "csc": true, "arcsin": true,
	"arccos": true, "arctan": true, "sinh": true, "cosh": true, "tanh": true, "coth": true, "log": true,
	"ln": true, "lg": true, "exp": true, "lim": true, "max": true, "min": true, "sup": true, "inf": true,
	"det": true, "dim": true, "ker": true, "deg": true, "gcd": true, "lcm": true, "arg": true, "sgn": true,
	"tr": true, "rank": true, "mod": true, "Pr": true, "limsup": true, "liminf": true,
}

// commands with an argument shown as it is
var latexStyleCommands = map[string]bool{
	"text": true, "textrm": true, "textit": true, "textbf": true, "textsf": true, "texttt": true,
	"mathrm": true, "mathit": true, "mathbf": true, "mathsf": true, "mathtt": true, "mathcal": true,
	"mathscr": true, "mathfrak": true, "operatorname": true, "boldsymbol": true, "bm": true, "underline": true,
	"mbox": true,
}

// commands without a visible result
var latexIgnored = map[string]bool{
	"displaystyle": true, "textstyle": true, "scriptstyle": true, "limits": true, "nolimits": true,
	"hline": true, "nonumber": true, "notag": true, "left": true, "right": true, "middle": true,
	"big": true, "Big": true, "bigg": true, "Bigg": true, "bigl": true, "bigr": true, "Bigl": true,
	"Bigr": true, "biggl": true, "biggr": true, "Biggl": true, "Biggr": true,
}

var latexAccents = map[string]string{
	"vec": "⃗", "hat": "̂", "widehat": "̂", "bar": "̄", "overline": "̅",
	"dot": "̇", "ddot": "̈", "tilde": "̃", "widetilde": "̃",
}

var latexBlackboard = map[rune]string{'R': "ℝ", 'N': "ℕ", 'Z': "ℤ", 'Q': "ℚ", 'C': "ℂ", 'P': "ℙ", 'E': "𝔼"}

var superscripts = map[rune]rune{
	'0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
	'+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ',
	'e': 'ᵉ', 'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ', 'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ',
	'o': 'ᵒ', 'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ',
	'z': 'ᶻ', 'T': 'ᵀ', 'A': 'ᴬ', 'B': 'ᴮ', 'D': 'ᴰ', 'E': 'ᴱ', 'G': 'ᴳ', 'H': 'ᴴ', 'I': 'ᴵ', 'J': 'ᴶ',
	'K': 'ᴷ', 'L': 'ᴸ', 'M': 'ᴹ', 'N': 'ᴺ', 'O': 'ᴼ', 'P': 'ᴾ', 'R': 'ᴿ', 'U': 'ᵁ', 'V': 'ⱽ', 'W': 'ᵂ',
	'′': '′', '∘': '°', '°': '°', '*': '*', '·': '˙',
}

var subscripts = map[rune]rune{
	'0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
	'+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎', 'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ',
	'j': 'ⱼ', 'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ',
	'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ', 'β': 'ᵦ', 'γ': 'ᵧ', 'ρ': 'ᵨ', 'φ': 'ᵩ', 'χ': 'ᵪ',
}

// latexConv converts LaTeX to text, left to right
type latexConv struct {
	r        []rune
	i        int
	lastWord string // the last function written (lim, max...): its limits go after it in parentheses
}

// latexInline is a formula as text on one line
func latexInline(s string) string {
	return tidyMath(latexText(s))
}

func latexText(s string) string {
	c := &latexConv{r: []rune(s)}
	return c.convert()
}

func (c *latexConv) peek() rune {
	if c.i < len(c.r) {
		return c.r[c.i]
	}
	return 0
}

func (c *latexConv) skipSpaces() {
	for c.i < len(c.r) && unicode.IsSpace(c.r[c.i]) {
		c.i++
	}
}

// readCommand reads the name after a backslash (letters, or one other character)
func (c *latexConv) readCommand() string {
	start := c.i
	for c.i < len(c.r) && (c.r[c.i] >= 'a' && c.r[c.i] <= 'z' || c.r[c.i] >= 'A' && c.r[c.i] <= 'Z') {
		c.i++
	}
	if c.i == start && c.i < len(c.r) {
		c.i++
	}
	return string(c.r[start:c.i])
}

// readGroup reads {...} (c.i at the brace) and returns what is inside
func (c *latexConv) readGroup() string {
	depth, start := 0, c.i+1
	for ; c.i < len(c.r); c.i++ {
		switch c.r[c.i] {
		case '\\':
			c.i++ // \{ and \} do not count
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				c.i++
				return string(c.r[start : c.i-1])
			}
		}
	}
	return string(c.r[min(start, len(c.r)):])
}

// readArg reads the argument of a command or of ^ and _: a group, a command or one character
func (c *latexConv) readArg() string {
	c.skipSpaces()
	switch c.peek() {
	case 0:
		return ""
	case '{':
		return c.readGroup()
	case '\\':
		start := c.i
		c.i++
		c.readCommand()
		return string(c.r[start:c.i])
	}
	c.i++
	return string(c.r[c.i-1])
}

// readOptional reads [..] if it follows
func (c *latexConv) readOptional() (string, bool) {
	c.skipSpaces()
	if c.peek() != '[' {
		return "", false
	}
	start := c.i + 1
	for ; c.i < len(c.r); c.i++ {
		if c.r[c.i] == ']' {
			c.i++
			return string(c.r[start : c.i-1]), true
		}
	}
	return string(c.r[start:]), true
}

// readEnvironment reads, after \begin, the name of the environment and its body up to its \end
func (c *latexConv) readEnvironment() (name, body string) {
	name = c.readArg()
	rest := string(c.r[c.i:])
	end := matchingEnd(rest, name)
	if end < 0 {
		c.i = len(c.r)
		return name, rest
	}
	body = rest[:end]
	c.i += len([]rune(rest[:end])) + len([]rune(`\end{`+name+`}`))
	return name, body
}

// matchingEnd is where the \end{name} of an environment whose body starts s is, or -1
func matchingEnd(s, name string) int {
	begin, end := `\begin{`+name+`}`, `\end{`+name+`}`
	depth := 0
	for i := 0; i < len(s); i++ {
		if strings.HasPrefix(s[i:], begin) {
			depth++
			i += len(begin) - 1
		} else if strings.HasPrefix(s[i:], end) {
			if depth == 0 {
				return i
			}
			depth--
			i += len(end) - 1
		}
	}
	return -1
}

func (c *latexConv) convert() string {
	var b strings.Builder
	for c.i < len(c.r) {
		ch := c.r[c.i]
		c.i++
		switch {
		case ch == '\\':
			b.WriteString(c.command(c.readCommand()))
		case ch == '{':
			c.i--
			b.WriteString(latexText(c.readGroup()))
		case ch == '}':
		case ch == '^' || ch == '_':
			arg := tidyMath(latexText(c.readArg()))
			b.WriteString(c.script(arg, ch == '^'))
			continue // lastWord stays for the other limit (\lim_{x\to 0}, \max_{i}^{n})
		case ch == '&' || ch == '~':
			b.WriteRune(' ')
		case ch == '-':
			b.WriteRune('−')
		case unicode.IsSpace(ch):
			b.WriteRune(' ')
		default:
			b.WriteRune(ch)
		}
		if ch != '\\' {
			c.lastWord = ""
		}
	}
	return b.String()
}

// command is the text of \name (and of its arguments)
func (c *latexConv) command(name string) string {
	word := ""
	defer func() { c.lastWord = word }()
	switch name {
	case ",", ";", ":", " ", "quad", "qquad", "enspace", "thinspace", "medspace", "thickspace":
		return " "
	case "!", "negthinspace":
		return ""
	case "\\":
		return "; "
	case "{", "}", "%", "&", "_", "#", "$":
		return name
	case "|":
		return "‖"
	case "frac", "dfrac", "tfrac", "cfrac":
		num, den := tidyMath(latexText(c.readArg())), tidyMath(latexText(c.readArg()))
		return fracPart(num, false) + "/" + fracPart(den, true)
	case "binom", "dbinom", "tbinom":
		n, k := tidyMath(latexText(c.readArg())), tidyMath(latexText(c.readArg()))
		return "C(" + n + ", " + k + ")"
	case "sqrt":
		index, hasIndex := c.readOptional()
		arg := tidyMath(latexText(c.readArg()))
		root := "√"
		if hasIndex {
			root = scriptOrNil(tidyMath(latexText(index)), superscripts) + "√"
		}
		if isSimpleMath(arg) {
			return root + arg
		}
		return root + "(" + arg + ")"
	case "mathbb":
		arg := strings.TrimSpace(c.readArg())
		if r := []rune(arg); len(r) == 1 && latexBlackboard[r[0]] != "" {
			return latexBlackboard[r[0]]
		}
		return arg
	case "begin":
		envName, body := c.readEnvironment()
		return envInline(envName, body)
	case "end":
		c.readArg()
		return ""
	case "not":
		next := latexText(c.readArg())
		if next == "=" {
			return "≠"
		}
		return next + "̸"
	}
	if accent, ok := latexAccents[name]; ok {
		arg := tidyMath(latexText(c.readArg()))
		if len([]rune(arg)) == 1 {
			return arg + accent
		}
		return "(" + arg + ")" + accent
	}
	if latexStyleCommands[name] {
		return latexText(c.readArg())
	}
	if latexIgnored[name] {
		if (name == "left" || name == "right" || name == "middle") && c.peek() == '.' {
			c.i++
		}
		return ""
	}
	if s, ok := latexSymbols[name]; ok {
		if name == "sum" || name == "prod" || name == "int" || name == "oint" || name == "iint" {
			word = name
		}
		return s
	}
	if latexFunctions[name] {
		word = name
		// a space before what follows, unless it is a parenthesis or its limits
		c.skipSpaces()
		if p := c.peek(); p == '(' || p == '^' || p == '_' || p == 0 {
			return name
		}
		return name + " "
	}
	return name
}

// script is a superscript (or a subscript) as Unicode characters if they all have one, else ^(...)
func (c *latexConv) script(arg string, sup bool) string {
	if arg == "" {
		return ""
	}
	table, mark := subscripts, "_"
	if sup {
		table, mark = superscripts, "^"
	}
	if s := scriptOrNil(arg, table); s != "" && !(c.lastWord == "lim" && !sup) {
		return s
	}
	switch c.lastWord {
	case "lim", "max", "min", "sup", "inf", "limsup", "liminf", "sum", "prod", "int", "oint", "iint":
		if !sup {
			return "(" + arg + ") " // lim(x→0) …
		}
	}
	if len([]rune(arg)) == 1 {
		return mark + arg
	}
	return mark + "(" + arg + ")"
}

// scriptOrNil: arg in superscript or subscript characters, or "" if one has none
func scriptOrNil(arg string, table map[rune]rune) string {
	var b strings.Builder
	for _, r := range strings.ReplaceAll(arg, " ", "") {
		s, ok := table[r]
		if !ok {
			return ""
		}
		b.WriteRune(s)
	}
	return b.String()
}

// isSimpleMath: a number or a name (no parentheses needed around it)
func isSimpleMath(s string) bool {
	if s == "" {
		return true
	}
	for _, r := range s {
		if !(unicode.IsLetter(r) || unicode.IsDigit(r) || r == '.' || r == ',' || isScriptRune(r) ||
			unicode.Is(unicode.Mn, r)) {
			return false
		}
	}
	return true
}

// fracPart is the numerator or the denominator of a fraction, in parentheses unless it is one term. A
// denominator of several factors is put in parentheses too: (…)/(2a), not (…)/2a.
func fracPart(s string, denominator bool) string {
	if isSimpleMath(s) && (!denominator || isOneFactor(s)) || isOneGroup(s) {
		return s
	}
	return "(" + s + ")"
}

// isOneFactor: a number, or one letter, with its scripts and accents (2, 3.5, x, x², a₁, π), or a
// differential (dx, dt², ∂x)
func isOneFactor(s string) bool {
	if r := []rune(s); len(r) >= 2 && (r[0] == 'd' || r[0] == '∂') && unicode.IsLetter(r[1]) && isOneFactor(string(r[1:])) {
		return true
	}
	letters, digits := 0, 0
	for _, r := range s {
		switch {
		case unicode.IsLetter(r) && !isScriptRune(r):
			letters++
		case unicode.IsDigit(r) && !isScriptRune(r), r == '.', r == ',':
			digits++
		}
	}
	return letters == 0 || letters == 1 && digits == 0
}

// isOneGroup: (…) with only scripts after it: (x + 1), (x − 1)²
func isOneGroup(s string) bool {
	r := []rune(s)
	if len(r) == 0 || r[0] != '(' {
		return false
	}
	depth := 0
	for i, ch := range r {
		switch ch {
		case '(':
			depth++
		case ')':
			depth--
			if depth == 0 {
				for _, rest := range r[i+1:] {
					if !isScriptRune(rest) {
						return false
					}
				}
				return true
			}
		}
	}
	return false
}

var scriptRunes = func() map[rune]bool {
	m := map[rune]bool{}
	for _, r := range superscripts {
		m[r] = true
	}
	for _, r := range subscripts {
		m[r] = true
	}
	delete(m, '*')
	return m
}()

func isScriptRune(r rune) bool { return scriptRunes[r] }

var mathRelations = map[rune]bool{
	'=': true, '≤': true, '≥': true, '≠': true, '≈': true, '≡': true, '→': true, '⇒': true, '⇔': true,
	'<': true, '>': true, '∈': true, '∉': true, '↦': true, '⟹': true, '∼': true, '≃': true, '≅': true,
	'∝': true, '⊂': true, '⊆': true, '←': true, '⇐': true, '↔': true, '⟶': true,
}

// writeSpaced writes an operator with a space on each side
func writeSpaced(b *strings.Builder, op rune) {
	b.WriteByte(' ')
	b.WriteRune(op)
	b.WriteByte(' ')
}

// tidyMath spaces relations and binary + − ± (not a sign: −1, (−x)) and removes extra spaces
func tidyMath(s string) string {
	r := []rune(s)
	var b strings.Builder
	lastNonSpace := func() rune {
		out := []rune(b.String())
		for i := len(out) - 1; i >= 0; i-- {
			if out[i] != ' ' {
				return out[i]
			}
		}
		return 0
	}
	for i, ch := range r {
		switch {
		case mathRelations[ch]:
			writeSpaced(&b, ch)
		case ch == '+' || ch == '−' || ch == '±' || ch == '∓':
			prev := lastNonSpace()
			binary := prev != 0 && (unicode.IsLetter(prev) || unicode.IsDigit(prev) || prev == ')' || prev == ']' ||
				prev == '}' || prev == '|' || prev == '′' || prev == '!' || isScriptRune(prev) ||
				unicode.Is(unicode.Mn, prev) || prev == '∞' || prev == '…' || prev == '⋯' || prev == '°')
			if binary && i+1 < len(r) {
				writeSpaced(&b, ch)
			} else {
				b.WriteRune(ch)
			}
		default:
			b.WriteRune(ch)
		}
	}
	out := strings.Join(strings.Fields(b.String()), " ")
	for _, fix := range [][2]string{{"( ", "("}, {" )", ")"}, {"[ ", "["}, {" ]", "]"}, {" ,", ","}, {" ;", ";"},
		{" .", "."}, {"| ", "|"}} {
		out = strings.ReplaceAll(out, fix[0], fix[1])
	}
	return out
}

// --- formulas with rows: a block of lines ---

type mathBox struct {
	lines []string
	base  int // the line in the middle, where the box joins the text beside it
}

func runeWidth(s string) int {
	n := 0
	for _, r := range s {
		if !unicode.Is(unicode.Mn, r) && !unicode.Is(unicode.Me, r) {
			n++
		}
	}
	return n
}

func padRight(s string, w int) string { return s + strings.Repeat(" ", max(0, w-runeWidth(s))) }
func padLeft(s string, w int) string  { return strings.Repeat(" ", max(0, w-runeWidth(s))) + s }

func (b mathBox) width() int {
	w := 0
	for _, l := range b.lines {
		w = max(w, runeWidth(l))
	}
	return w
}

// hcat puts boxes side by side, their middle lines together
func hcat(boxes []mathBox) mathBox {
	above, below := 0, 0
	for _, b := range boxes {
		above, below = max(above, b.base), max(below, len(b.lines)-1-b.base)
	}
	lines := make([]string, above+below+1)
	for k, b := range boxes {
		w, top := b.width(), above-b.base
		for i := range lines {
			cell := ""
			if j := i - top; j >= 0 && j < len(b.lines) {
				cell = b.lines[j]
			}
			if k > 0 {
				lines[i] += " "
			}
			lines[i] += padRight(cell, w)
		}
	}
	return mathBox{lines: lines, base: above}
}

// mathNeedsBlock: a formula with rows (an environment, or \\ in a displayed formula)
func mathNeedsBlock(s string, display bool) bool {
	return strings.Contains(s, `\begin{`) || display && len(splitTopLevel(s, `\\`)) > 1
}

// renderMathBlock lays out a formula with rows: its text on one line, beside its environments
func renderMathBlock(s string) mathBox {
	var boxes []mathBox
	addText := func(t string) {
		if t = latexInline(t); t != "" {
			boxes = append(boxes, mathBox{lines: []string{t}})
		}
	}
	if !strings.Contains(s, `\begin{`) {
		return envBox("gathered", s)
	}
	for {
		i := strings.Index(s, `\begin{`)
		if i < 0 {
			addText(s)
			break
		}
		addText(s[:i])
		c := &latexConv{r: []rune(s[i+len(`\begin`):])}
		name, body := c.readEnvironment()
		boxes = append(boxes, envBox(name, body))
		s = string(c.r[c.i:])
	}
	if len(boxes) == 0 {
		return mathBox{lines: []string{""}}
	}
	return hcat(boxes)
}

// splitTopLevel splits s at sep outside braces and nested environments
func splitTopLevel(s, sep string) []string {
	var parts []string
	depth, envDepth, start := 0, 0, 0
	for i := 0; i < len(s); i++ {
		switch {
		case strings.HasPrefix(s[i:], `\begin{`):
			envDepth++
			i += len(`\begin{`) - 1
		case strings.HasPrefix(s[i:], `\end{`):
			envDepth--
			i += len(`\end{`) - 1
		case depth == 0 && envDepth == 0 && strings.HasPrefix(s[i:], sep):
			parts = append(parts, s[start:i])
			i += len(sep) - 1
			start = i + 1
		case s[i] == '\\':
			i++ // \{ \} \& do not count
		case s[i] == '{':
			depth++
		case s[i] == '}':
			depth--
		}
	}
	return append(parts, s[start:])
}

// envRows: the rows and cells of an environment
func envRows(name, body string) [][]string {
	body = strings.ReplaceAll(body, `\hline`, "")
	if name == "array" || name == "alignat" || name == "alignat*" {
		c := &latexConv{r: []rune(body)}
		c.skipSpaces()
		if c.peek() == '{' {
			c.readGroup() // the columns' spec
		}
		body = string(c.r[c.i:])
	}
	if strings.HasPrefix(name, "aligned") || name == "gathered" {
		c := &latexConv{r: []rune(body)}
		c.readOptional() // [t]
		body = string(c.r[c.i:])
	}
	var rows [][]string
	for _, row := range splitTopLevel(body, `\\`) {
		if strings.TrimSpace(row) == "" {
			continue
		}
		var cells []string
		for _, cell := range splitTopLevel(row, "&") {
			cells = append(cells, latexInline(cell))
		}
		rows = append(rows, cells)
	}
	return rows
}

// envBrackets: the brackets around an environment
func envBrackets(name string) (string, string) {
	switch strings.TrimSuffix(name, "*") {
	case "pmatrix":
		return "(", ")"
	case "bmatrix":
		return "[", "]"
	case "Bmatrix":
		return "{", "}"
	case "vmatrix":
		return "|", "|"
	case "Vmatrix":
		return "‖", "‖"
	case "cases", "dcases":
		return "{", ""
	case "rcases":
		return "", "}"
	}
	return "", ""
}

// envBox lays out an environment: its columns aligned and, for matrices and systems, tall brackets
func envBox(name, body string) mathBox {
	rows := envRows(name, body)
	if len(rows) == 0 {
		return mathBox{lines: []string{""}}
	}
	cols := 0
	for _, row := range rows {
		cols = max(cols, len(row))
	}
	widths := make([]int, cols)
	for _, row := range rows {
		for j, cell := range row {
			widths[j] = max(widths[j], runeWidth(cell))
		}
	}
	base := strings.TrimSuffix(name, "*")
	lines := make([]string, len(rows))
	for i, row := range rows {
		var b strings.Builder
		for j := 0; j < cols; j++ {
			cell := ""
			if j < len(row) {
				cell = row[j]
			}
			switch {
			case strings.HasSuffix(base, "matrix"):
				// numbers: right aligned
				if j > 0 {
					b.WriteString("  ")
				}
				b.WriteString(padLeft(cell, widths[j]))
			case base == "align" || base == "aligned" || base == "split" || base == "eqnarray" ||
				base == "alignat" || base == "alignedat" || base == "flalign":
				// pairs right&left, aligned at the relation
				if j%2 == 0 {
					if j > 0 {
						b.WriteString("    ")
					}
					b.WriteString(padLeft(cell, widths[j]))
				} else {
					b.WriteByte(' ')
					b.WriteString(padRight(cell, widths[j]))
				}
			case base == "cases" || base == "dcases" || base == "rcases":
				if j > 0 {
					b.WriteString("   ")
				}
				b.WriteString(padRight(cell, widths[j]))
			default:
				if j > 0 {
					b.WriteString("  ")
				}
				b.WriteString(padRight(cell, widths[j]))
			}
		}
		lines[i] = b.String()
	}
	width := 0
	for _, l := range lines {
		width = max(width, runeWidth(l))
	}
	left, right := envBrackets(name)
	leftCol, rightCol := bracketColumn(left, len(lines)), bracketColumn(right, len(lines))
	for i := range lines {
		line := padRight(lines[i], width)
		if left != "" {
			line = leftCol[i] + " " + line
		}
		if right != "" {
			line += " " + rightCol[i]
		}
		lines[i] = line
	}
	return mathBox{lines: lines, base: (len(lines) - 1) / 2}
}

// bracketColumn is a bracket n lines tall
func bracketColumn(bracket string, n int) []string {
	col := make([]string, n)
	if n == 1 {
		col[0] = bracket
		return col
	}
	var top, mid, bot, ext string
	switch bracket {
	case "(":
		top, mid, bot, ext = "⎛", "⎜", "⎝", "⎜"
	case ")":
		top, mid, bot, ext = "⎞", "⎟", "⎠", "⎟"
	case "[":
		top, mid, bot, ext = "⎡", "⎢", "⎣", "⎢"
	case "]":
		top, mid, bot, ext = "⎤", "⎥", "⎦", "⎥"
	case "{":
		top, mid, bot, ext = "⎧", "⎨", "⎩", "⎪"
	case "}":
		top, mid, bot, ext = "⎫", "⎬", "⎭", "⎪"
	case "|", "‖":
		for i := range col {
			col[i] = map[string]string{"|": "│", "‖": "‖"}[bracket]
		}
		return col
	default:
		for i := range col {
			col[i] = bracket
		}
		return col
	}
	for i := range col {
		col[i] = ext
	}
	col[0], col[n-1] = top, bot
	if n >= 3 && (bracket == "{" || bracket == "}") {
		col[(n-1)/2] = mid
	}
	return col
}

// envInline: an environment inside a formula on one line (a matrix in a cell): its rows separated by ;
func envInline(name, body string) string {
	var rows []string
	for _, row := range envRows(name, body) {
		rows = append(rows, strings.Join(row, ", "))
	}
	inner := strings.Join(rows, "; ")
	left, right := envBrackets(name)
	if left == "" && right == "" {
		return inner
	}
	if left == "{" && right == "" {
		return "{ " + inner
	}
	return left + inner + right
}

// --- the text for Telegram ---

var markdownBoldRe = regexp.MustCompile(`\*\*(.+?)\*\*`)

var mathPlaceholderRe = regexp.MustCompile("\x00M(\\d+)\x00")

// telegramHTML: a chat text as Telegram HTML: escaped, its **bold** in bold and its formulas as text (on
// one line, or as a <pre> block when they have rows)
func telegramHTML(text string) string {
	var plain strings.Builder
	var formulas []string
	for _, part := range splitMath(strings.TrimSpace(text)) {
		if !part.math {
			plain.WriteString(part.text)
			continue
		}
		var out string
		if mathNeedsBlock(part.text, part.display) {
			box := renderMathBlock(part.text)
			lines := make([]string, len(box.lines))
			for i, l := range box.lines {
				lines[i] = html.EscapeString(strings.TrimRight(l, " "))
			}
			out = "\n<pre>" + strings.Join(lines, "\n") + "</pre>\n"
		} else {
			out = html.EscapeString(latexInline(part.text))
		}
		plain.WriteString("\x00M")
		plain.WriteString(strconv.Itoa(len(formulas)))
		plain.WriteByte(0)
		formulas = append(formulas, out)
	}
	escaped := markdownBoldRe.ReplaceAllString(html.EscapeString(plain.String()), "<b>$1</b>")
	result := mathPlaceholderRe.ReplaceAllStringFunc(escaped, func(m string) string {
		n, _ := strconv.Atoi(m[2 : len(m)-1])
		return formulas[n]
	})
	// a block on its own lines, without blank lines added around it
	for strings.Contains(result, "\n\n<pre>") || strings.Contains(result, "</pre>\n\n") {
		result = strings.ReplaceAll(result, "\n\n<pre>", "\n<pre>")
		result = strings.ReplaceAll(result, "</pre>\n\n", "</pre>\n")
	}
	result = strings.ReplaceAll(result, " \n<pre>", "\n<pre>")
	return strings.Trim(result, "\n")
}
