package nodes

import (
	"strings"
	"testing"
)

func TestTelegramLatexInline(t *testing.T) {
	cases := map[string]string{
		`He leído: $$\int_{0}^{2} 3x^{2}\,dx$$`:                             "He leído: ∫₀² 3x² dx",
		`Solución: $$x = 2$$`:                                               "Solución: x = 2",
		`$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$`:                          "x = (−b ± √(b² − 4ac))/(2a)",
		`$x_1 = 2$, $x_2 = 3$`:                                              "x₁ = 2, x₂ = 3",
		`$$\lim_{x \to 0} \frac{\sin x}{x} = 1$$`:                           "lim(x → 0) (sin x)/x = 1",
		`$\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}$`:             "∑ₙ₌₁^∞ 1/n² = π²/6",
		`$\sqrt[3]{27} = 3$`:                                                "³√27 = 3",
		`$x \in \mathbb{R}$, $\alpha \le \beta$`:                            "x ∈ ℝ, α ≤ β",
		`\(a \cdot b\) y \[c \neq d\]`:                                      "a · b y c ≠ d",
		`$$\frac{d}{dx}\left(\frac{x+1}{x-1}\right) = -\frac{2}{(x-1)^2}$$`: "d/dx((x + 1)/(x − 1)) = −2/(x − 1)²",
		`**Resultado:** $e^{i\pi} + 1 = 0$`:                                 "<b>Resultado:</b> e^(iπ) + 1 = 0",
		// not mathematics: prices, and HTML escaped
		`Cuesta 5$ y 3$ <b>no</b> & más`: "Cuesta 5$ y 3$ &lt;b&gt;no&lt;/b&gt; &amp; más",
	}
	for in, want := range cases {
		if got := telegramHTML(in); got != want {
			t.Errorf("%s\n got %q\nwant %q", in, got, want)
		}
	}
}

func TestTelegramLatexBlocks(t *testing.T) {
	cases := map[string]string{
		`Solución: $$A = \begin{pmatrix} 1 & 2 & 0 \\ 3 & -1 & 4 \\ 0 & 5 & 12 \end{pmatrix}$$`: "Solución:\n<pre>" +
			"    ⎛ 1   2   0 ⎞\n" +
			"A = ⎜ 3  −1   4 ⎟\n" +
			"    ⎝ 0   5  12 ⎠</pre>",
		"He leído: $$\\begin{cases} 2x + y - z = 3 \\\\ x - y + 2z = 1 \\\\ 3x + 2y = 7 \\end{cases}$$\nSolución: $x = 1$": "He leído:\n<pre>" +
			"⎧ 2x + y − z = 3\n" +
			"⎨ x − y + 2z = 1\n" +
			"⎩ 3x + 2y = 7</pre>\nSolución: x = 1",
		`$$\begin{aligned} f(x) &= x^2 + 2x \\ g(x) &= 2x + 2 \end{aligned}$$`: "<pre>" +
			"f(x) = x² + 2x\n" +
			"g(x) = 2x + 2</pre>",
		`$f(x) = \begin{cases} x^2 & \text{si } x \ge 0 \\ -x & \text{si } x < 0 \end{cases}$`: "<pre>" +
			"f(x) = ⎧ x²   si x ≥ 0\n" +
			"       ⎩ −x   si x &lt; 0</pre>",
		// a linear system in matrix form, and the same system with a brace
		"$$\\begin{bmatrix} 2 & 1 \\\\ 1 & -1 \\end{bmatrix} \\begin{bmatrix} x \\\\ y \\end{bmatrix} = \\begin{bmatrix} 4 \\\\ 2 \\end{bmatrix}$$\n$$\\begin{cases} 2x + y = 4 \\\\ x - y = 2 \\end{cases}$$": "<pre>" +
			"⎡ 2   1 ⎤ ⎡ x ⎤ = ⎡ 4 ⎤\n" +
			"⎣ 1  −1 ⎦ ⎣ y ⎦   ⎣ 2 ⎦</pre>\n<pre>" +
			"⎧ 2x + y = 4\n" +
			"⎩ x − y = 2</pre>",
		`$$\det\begin{vmatrix} a & b \\ c & d \end{vmatrix} = ad - bc$$`: "<pre>" +
			"det │ a  b │ = ad − bc\n" +
			"    │ c  d │</pre>",
	}
	for in, want := range cases {
		if got := telegramHTML(in); got != want {
			t.Errorf("%s\n got:\n%s\nwant:\n%s", in, got, want)
		}
	}
}

func TestTelegramAnswerTextLongWithMatrix(t *testing.T) {
	answer := strings.Repeat("Texto largo de la respuesta. ", 200) +
		`$$\begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}$$`
	got := TelegramAnswerText(ChatInboxMessage{Message: answer})
	if n := len([]rune(got)); n > telegramMaxText {
		t.Fatalf("%d characters", n)
	}
	if strings.Count(got, "<pre>") != strings.Count(got, "</pre>") || strings.Count(got, "<b>") != strings.Count(got, "</b>") {
		t.Errorf("a tag left open: %q", got[len(got)-80:])
	}
}
