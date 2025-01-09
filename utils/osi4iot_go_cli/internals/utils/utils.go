package utils

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/exp/rand"
)

// countryMap contiene los países y sus respectivos códigos.
var CountryMap = map[string]string{
	"Afghanistan":                            "AF",
	"Åland Islands":                          "AX",
	"Albania":                                "AL",
	"Algeria":                                "DZ",
	"American Samoa":                         "AS",
	"AndorrA":                                "AD",
	"Angola":                                 "AO",
	"Anguilla":                               "AI",
	"Antarctica":                             "AQ",
	"Antigua and Barbuda":                    "AG",
	"Argentina":                              "AR",
	"Armenia":                                "AM",
	"Aruba":                                  "AW",
	"Australia":                              "AU",
	"Austria":                                "AT",
	"Azerbaijan":                             "AZ",
	"Bahamas":                                "BS",
	"Bahrain":                                "BH",
	"Bangladesh":                             "BD",
	"Barbados":                               "BB",
	"Belarus":                                "BY",
	"Belgium":                                "BE",
	"Belize":                                 "BZ",
	"Benin":                                  "BJ",
	"Bermuda":                                "BM",
	"Bhutan":                                 "BT",
	"Bolivia":                                "BO",
	"Bosnia and Herzegovina":                 "BA",
	"Botswana":                               "BW",
	"Bouvet Island":                          "BV",
	"Brazil":                                 "BR",
	"British Indian Ocean Territory":         "IO",
	"Brunei Darussalam":                      "BN",
	"Bulgaria":                               "BG",
	"Burkina Faso":                           "BF",
	"Burundi":                                "BI",
	"Cambodia":                               "KH",
	"Cameroon":                               "CM",
	"Canada":                                 "CA",
	"Cape Verde":                             "CV",
	"Cayman Islands":                         "KY",
	"Central African Republic":               "CF",
	"Chad":                                   "TD",
	"Chile":                                  "CL",
	"China":                                  "CN",
	"Christmas Island":                       "CX",
	"Cocos (Keeling) Islands":                "CC",
	"Colombia":                               "CO",
	"Comoros":                                "KM",
	"Congo":                                  "CG",
	"Congo, The Democratic Republic of the":  "CD",
	"Cook Islands":                           "CK",
	"Costa Rica":                             "CR",
	"Cote D'Ivoire":                          "CI",
	"Croatia":                                "HR",
	"Cuba":                                   "CU",
	"Cyprus":                                 "CY",
	"Czech Republic":                         "CZ",
	"Denmark":                                "DK",
	"Djibouti":                               "DJ",
	"Dominica":                               "DM",
	"Dominican Republic":                     "DO",
	"Ecuador":                                "EC",
	"Egypt":                                  "EG",
	"El Salvador":                            "SV",
	"Equatorial Guinea":                      "GQ",
	"Eritrea":                                "ER",
	"Estonia":                                "EE",
	"Ethiopia":                               "ET",
	"Falkland Islands (Malvinas)":            "FK",
	"Faroe Islands":                          "FO",
	"Fiji":                                   "FJ",
	"Finland":                                "FI",
	"France":                                 "FR",
	"French Guiana":                          "GF",
	"French Polynesia":                       "PF",
	"French Southern Territories":            "TF",
	"Gabon":                                  "GA",
	"Gambia":                                 "GM",
	"Georgia":                                "GE",
	"Germany":                                "DE",
	"Ghana":                                  "GH",
	"Gibraltar":                              "GI",
	"Greece":                                 "GR",
	"Greenland":                              "GL",
	"Grenada":                                "GD",
	"Guadeloupe":                             "GP",
	"Guam":                                   "GU",
	"Guatemala":                              "GT",
	"Guernsey":                               "GG",
	"Guinea":                                 "GN",
	"Guinea-Bissau":                          "GW",
	"Guyana":                                 "GY",
	"Haiti":                                  "HT",
	"Heard Island and Mcdonald Islands":      "HM",
	"Holy See (Vatican City State)":          "VA",
	"Honduras":                               "HN",
	"Hong Kong":                              "HK",
	"Hungary":                                "HU",
	"Iceland":                                "IS",
	"India":                                  "IN",
	"Indonesia":                              "ID",
	"Iran, Islamic Republic Of":              "IR",
	"Iraq":                                   "IQ",
	"Ireland":                                "IE",
	"Isle of Man":                            "IM",
	"Israel":                                 "IL",
	"Italy":                                  "IT",
	"Jamaica":                                "JM",
	"Japan":                                  "JP",
	"Jersey":                                 "JE",
	"Jordan":                                 "JO",
	"Kazakhstan":                             "KZ",
	"Kenya":                                  "KE",
	"Kiribati":                               "KI",
	"Korea, Democratic People'S Republic of": "KP",
	"Korea, Republic of":                     "KR",
	"Kuwait":                                 "KW",
	"Kyrgyzstan":                             "KG",
	"Lao People'S Democratic Republic":       "LA",
	"Latvia":                                 "LV",
	"Lebanon":                                "LB",
	"Lesotho":                                "LS",
	"Liberia":                                "LR",
	"Libyan Arab Jamahiriya":                 "LY",
	"Liechtenstein":                          "LI",
	"Lithuania":                              "LT",
	"Luxembourg":                             "LU",
	"Macao":                                  "MO",
	"Macedonia, The Former Yugoslav Republic of": "MK",
	"Madagascar":                       "MG",
	"Malawi":                           "MW",
	"Malaysia":                         "MY",
	"Maldives":                         "MV",
	"Mali":                             "ML",
	"Malta":                            "MT",
	"Marshall Islands":                 "MH",
	"Martinique":                       "MQ",
	"Mauritania":                       "MR",
	"Mauritius":                        "MU",
	"Mayotte":                          "YT",
	"Mexico":                           "MX",
	"Micronesia, Federated States of":  "FM",
	"Moldova, Republic of":             "MD",
	"Monaco":                           "MC",
	"Mongolia":                         "MN",
	"Montserrat":                       "MS",
	"Morocco":                          "MA",
	"Mozambique":                       "MZ",
	"Myanmar":                          "MM",
	"Namibia":                          "NA",
	"Nauru":                            "NR",
	"Nepal":                            "NP",
	"Netherlands":                      "NL",
	"Netherlands Antilles":             "AN",
	"New Caledonia":                    "NC",
	"New Zealand":                      "NZ",
	"Nicaragua":                        "NI",
	"Niger":                            "NE",
	"Nigeria":                          "NG",
	"Niue":                             "NU",
	"Norfolk Island":                   "NF",
	"Northern Mariana Islands":         "MP",
	"Norway":                           "NO",
	"Oman":                             "OM",
	"Pakistan":                         "PK",
	"Palau":                            "PW",
	"Palestinian Territory, Occupied":  "PS",
	"Panama":                           "PA",
	"Papua New Guinea":                 "PG",
	"Paraguay":                         "PY",
	"Peru":                             "PE",
	"Philippines":                      "PH",
	"Pitcairn":                         "PN",
	"Poland":                           "PL",
	"Portugal":                         "PT",
	"Puerto Rico":                      "PR",
	"Qatar":                            "QA",
	"Reunion":                          "RE",
	"Romania":                          "RO",
	"Russian Federation":               "RU",
	"RWANDA":                           "RW",
	"Saint Helena":                     "SH",
	"Saint Kitts and Nevis":            "KN",
	"Saint Lucia":                      "LC",
	"Saint Pierre and Miquelon":        "PM",
	"Saint Vincent and the Grenadines": "VC",
	"Samoa":                            "WS",
	"San Marino":                       "SM",
	"Sao Tome and Principe":            "ST",
	"Saudi Arabia":                     "SA",
	"Senegal":                          "SN",
	"Serbia and Montenegro":            "CS",
	"Seychelles":                       "SC",
	"Sierra Leone":                     "SL",
	"Singapore":                        "SG",
	"Slovakia":                         "SK",
	"Slovenia":                         "SI",
	"Solomon Islands":                  "SB",
	"Somalia":                          "SO",
	"South Africa":                     "ZA",
	"South Georgia and the South Sandwich Islands": "GS",
	"Spain":                                "ES",
	"Sri Lanka":                            "LK",
	"Sudan":                                "SD",
	"Suriname":                             "SR",
	"Svalbard and Jan Mayen":               "SJ",
	"Swaziland":                            "SZ",
	"Sweden":                               "SE",
	"Switzerland":                          "CH",
	"Syrian Arab Republic":                 "SY",
	"Taiwan, Province of China":            "TW",
	"Tajikistan":                           "TJ",
	"Tanzania, United Republic of":         "TZ",
	"Thailand":                             "TH",
	"Timor-Leste":                          "TL",
	"Togo":                                 "TG",
	"Tokelau":                              "TK",
	"Tonga":                                "TO",
	"Trinidad and Tobago":                  "TT",
	"Tunisia":                              "TN",
	"Turkey":                               "TR",
	"Turkmenistan":                         "TM",
	"Turks and Caicos Islands":             "TC",
	"Tuvalu":                               "TV",
	"Uganda":                               "UG",
	"Ukraine":                              "UA",
	"United Arab Emirates":                 "AE",
	"United Kingdom":                       "GB",
	"United States":                        "US",
	"United States Minor Outlying Islands": "UM",
	"Uruguay":                              "UY",
	"Uzbekistan":                           "UZ",
	"Vanuatu":                              "VU",
	"Venezuela":                            "VE",
	"Viet Nam":                             "VN",
	"Virgin Islands, British":              "VG",
	"Virgin Islands, U.S.":                 "VI",
	"Wallis and Futuna":                    "WF",
	"Western Sahara":                       "EH",
	"Yemen":                                "YE",
	"Zambia":                               "ZM",
	"Zimbabwe":                             "ZW",
}

// giveCountryCode retorna el código del país dado su nombre.
func GiveCountryCode(countryName string) string {
	if code, exists := CountryMap[countryName]; exists {
		return code
	}
	return ""
}

func GeneratePassword(passwordLength int) string {
	time.Sleep(1 * time.Microsecond)
	source := rand.NewSource(uint64(time.Now().UnixMicro()))
	rng := rand.New(source)
	lowerCase := "abcdefghijklmnopqrstuvwxyz" // lowercase
	upperCase := "ABCDEFGHIJKLMNOPQRSTUVWXYZ" // uppercase
	numbers := "0123456789"
	var password strings.Builder
	for n := 0; n < passwordLength; n++ {
		randNum := rng.Intn(3)
		switch randNum {
		case 0:
			randCharNum := rng.Intn(len(lowerCase))
			password.WriteByte(lowerCase[randCharNum])
		case 1:
			randCharNum := rng.Intn(len(upperCase))
			password.WriteByte(upperCase[randCharNum])
		case 2:
			randCharNum := rng.Intn(len(numbers))
			password.WriteByte(numbers[randCharNum])
		}
	}
	return password.String()
}

func HashPassword(password string) (string, error) {
	cost := 8
	hash, err := bcrypt.GenerateFromPassword([]byte(password), cost)
	if err != nil {
		return "", err
	}

	return string(hash), nil
}

func WriteToFile(path string, data []byte, mod os.FileMode) error {
	pathArray := strings.Split(path, "/")
	parentPath := strings.Join(pathArray[:len(pathArray)-1], "/")
	err := os.MkdirAll(parentPath, os.ModePerm)
	if err != nil {
		return err
	}

	err = os.WriteFile(path, data, mod)
	if err != nil {
		return err
	}

	return nil
}

func FloatValueToStr(value float64) string {
	if value == 0.0 {
		return ""
	}
	return fmt.Sprintf("%f", value)
}

func IntValueToStr(value int) string {
	if value == 0 {
		return ""
	}
	return strconv.Itoa(value)
}

func GiveChoiceFocus(choice string, choices []string, defaultFocus int) int {
	if choice == "" {
		return defaultFocus
	}
	for i, c := range choices {
		if c == choice {
			return i
		}
	}
	return defaultFocus
}

func HideCursor() {
	fmt.Print("\033[?25l")
}

func ShowCursor() {
	fmt.Print("\033[?25h")
}

func Spinner(spinnerMsg string, endMsg string, done chan bool) {
	go func() {
		HideCursor()
		defer ShowCursor()
		frames := []string{"|", "/", "-", "\\"} // Frames del spinner
		for {
			select {
			case <-done:
				spaces := strings.Repeat(" ", len(spinnerMsg)+10)
				fmt.Printf("\r%s%s\n", endMsg, spaces)
				return
			default:
				for _, frame := range frames {
					fmt.Printf("\r%s  %s", spinnerMsg, frame)
					time.Sleep(100 * time.Millisecond)
				}
			}
		}
	}()
}

var AwsRegions = []string{
	"US East (Ohio)",
	"US East (N. Virginia)",
	"US West (N. California)",
	"US West (Oregon)",
	"Africa (Cape Town)",
	"Asia Pacific (Hong Kong)",
	"Asia Pacific (Hyderabad)",
	"Asia Pacific (Jakarta)",
	"Asia Pacific (Malaysia)",
	"Asia Pacific (Melbourne)",
	"Asia Pacific (Mumbai)",
	"Asia Pacific (Osaka)",
	"Asia Pacific (Seoul)",
	"Asia Pacific (Singapore)",
	"Asia Pacific (Sydney)",
	"Asia Pacific (Thailand)",
	"Asia Pacific (Tokyo)",
	"Canada (Central)",
	"Canada West (Calgary)",
	"Europe (Frankfurt)",
	"Europe (Ireland)",
	"Europe (London)",
	"Europe (Milan)",
	"Europe (Paris)",
	"Europe (Spain)",
	"Europe (Stockholm)",
	"Europe (Zurich)",
	"Israel (Tel Aviv)",
	"Middle East (Bahrain)",
	"Middle East (UAE)",
	"South America (São Paulo)",
}

var AwsRegionsMap = map[string]string{
	"US East (Ohio)":           "us-east-2",
	"US East (N. Virginia)":    "us-east-1",
	"US West (N. California)":  "us-west-1",
	"US West (Oregon)":         "us-west-2",
	"Africa (Cape Town)":       "af-south-1",
	"Asia Pacific (Hong Kong)": "ap-east-1",
	"Asia Pacific (Hyderabad)": "ap-south-2",
	"Asia Pacific (Jakarta)":   "ap-southeast-3",
	"Asia Pacific (Malaysia)":  "ap-southeast-5",
	"Asia Pacific (Melbourne)": "ap-southeast-4",
	"Asia Pacific (Mumbai)":    "ap-south-1",
	"Asia Pacific (Osaka)":     "ap-northeast-3",
	"Asia Pacific (Seoul)":     "ap-northeast-2",
	"Asia Pacific (Singapore)": "ap-southeast-1",
	"Asia Pacific (Sydney)":    "ap-southeast-2",
	"Asia Pacific (Thailand)":  "ap-southeast-7",
	"Asia Pacific (Tokyo)":     "ap-northeast-1",
	"Canada (Central)":         "ca-central-1",
	"Canada West (Calgary)":    "ca-west-1",
	"Europe (Frankfurt)":       "eu-central-1",
	"Europe (Ireland)":         "eu-west-1",
	"Europe (London)":          "eu-west-2",
	"Europe (Milan)":           "eu-south-1",
	"Europe (Paris)":           "eu-west-3",
	"Europe (Spain)":           "eu-south-2",
	"Europe (Stockholm)":       "eu-north-1",
	"Europe (Zurich)":          "eu-central-2",
	"Israel (Tel Aviv)":        "il-central-1",
	"Middle East (Bahrain)":    "me-south-1",
	"Middle East (UAE)":        "me-central-1",
	"South America (São Paulo)": "sa-east-1",
}

var StyleWarningMsg = lipgloss.NewStyle().
	Bold(true).
	Foreground(lipgloss.Color("227"))

var StyleErrMsg = lipgloss.NewStyle().
	Bold(true).
	Foreground(lipgloss.Color("9"))

var StyleOKMsg = lipgloss.NewStyle().
	Bold(true).
	Foreground(lipgloss.Color("#00FF00"))
