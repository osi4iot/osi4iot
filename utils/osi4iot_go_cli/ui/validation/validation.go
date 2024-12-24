package validation

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/mail"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
)

func isString(value interface{}, prompt string) (bool, string) {
	_, ok := value.(string)
	errMsg := ""
	if !ok {
		errMsg = fmt.Sprintf("Error: '%s' is not a string", prompt)
	}
	return ok, errMsg
}

func isInt(value interface{}, prompt string) (bool, string) {
	valueString := fmt.Sprintf("%v", value)
	_, err := strconv.Atoi(valueString)
	if err != nil {
		errMsg := fmt.Sprintf("Error: '%s' is not a integer", prompt)
		return false, errMsg
	}
	return true, ""
}

func isFloat(value interface{}, prompt string) (bool, string) {
	valueString := fmt.Sprintf("%v", value)
	_, err := strconv.ParseFloat(valueString, 64)
	if err != nil {
		errMsg := fmt.Sprintf("Error: '%s' is not a float", prompt)
		return false, errMsg
	}
	return true, ""
}

func isBool(value interface{}, prompt string) (bool, string) {
	_, ok := value.(bool)
	errMsg := ""
	if !ok {
		errMsg = fmt.Sprintf("Error: '%s' is must be a boolean", prompt)
	}
	return ok, errMsg
}

func isEmail(email string, prompt string) (bool, string) {
	_, err := mail.ParseAddress(email)
	if err != nil {
		errMsg := fmt.Sprintf("Error: '%s' must be a valid email", prompt)
		return false, errMsg
	}

	return true, ""
}

func minValue(value string, min string, prompt string) (bool, string) {
	valueInt, isIntValue := strconv.Atoi(value)
	minInt, isIntMin := strconv.Atoi(min)
	if isIntValue == nil && isIntMin == nil {
		if valueInt < minInt {
			errMsg := fmt.Sprintf("Error: '%s' is less than %d", prompt, minInt)
			return false, errMsg
		}
	}

	valueDouble, isFloatValue := strconv.ParseFloat(value, 64)
	minDouble, isFloatMin := strconv.ParseFloat(min, 64)
	if isFloatValue == nil && isFloatMin == nil {
		if valueDouble < minDouble {
			errMsg := fmt.Sprintf("Error: '%s' is less than %f", prompt, minDouble)
			return false, errMsg
		}
	}

	if !(isIntValue == nil || isFloatValue == nil || isIntMin == nil || isFloatMin == nil) {
		errMsg := fmt.Sprintf("Error: '%s' is not a valid number", prompt)
		return false, errMsg
	}
	return true, ""
}

func maxValue(value string, max string, prompt string) (bool, string) {
	valueInt, isIntValue := strconv.Atoi(value)
	maxInt, isIntMax := strconv.Atoi(max)
	if isIntValue == nil && isIntMax == nil {
		if valueInt > maxInt {
			errMsg := fmt.Sprintf("Error: '%s' is greater than %d", prompt, maxInt)
			return false, errMsg
		} else {
			return true, ""
		}
	}

	valueDouble, isFloatValue := strconv.ParseFloat(value, 64)
	maxDouble, isFloatMax := strconv.ParseFloat(max, 64)
	if isFloatValue == nil && isFloatMax == nil {
		if valueDouble > maxDouble {
			errMsg := fmt.Sprintf("Error: '%s' is greater than %f", prompt, maxDouble)
			return false, errMsg
		} else {
			return true, ""
		}
	}

	if !(isIntValue == nil || isFloatValue == nil || isIntMax == nil || isFloatMax == nil) {
		errMsg := fmt.Sprintf("Error: '%s' is not a valid number", prompt)
		return false, errMsg
	}
	return true, ""
}

func isIPAdress(ip string, prompt string) (bool, string) {
	if net.ParseIP(ip) == nil {
		errMsg := fmt.Sprintf("Error: '%s' is must be a valid IP adress", prompt)
		return false, errMsg
	}
	return true, ""
}

func password(value string, prompt string) (bool, string) {
	_, err := regexp.MatchString("^[a-zA-Z0-9._-]{8,20}$", value)
	if err != nil {
		errMsg := fmt.Sprintf("Error: '%s' the password must be an string with 8 to 20 characters.\n It must contain only characters, numeric digits, underscore and first character must be a letter", prompt)
		return false, errMsg
	}
	return true, ""
}

func matchPrevious(value, previousValue string, prompt string) (bool, string) {
	if previousValue != value {
		errMsg := fmt.Sprintf("Error: '%s' must match with the previous one", prompt)
		return false, errMsg
	}
	return true, ""
}

func checkTimeZone(value string) (bool, string) {
	_, err := time.LoadLocation(value)
	if err != nil {
		return false, fmt.Sprintf("Error: '%s' is not a valid timezone", value)
	}
	return true, ""
}

// existsCountry verifica si el país existe en el mapa.
func isValidCountry(countryName string) (bool, string) {
	_, exists := utils.CountryMap[countryName]
	if !exists {
		return false, fmt.Sprintf("Error: '%s' is not a valid country", countryName)
	}
	return true, ""
}

func isValidUrl(rawUrl string) (bool, string) {
	_, err := url.ParseRequestURI(rawUrl)
	if err != nil {
		return false, fmt.Sprintf("Error: '%s' is not a valid URL", rawUrl)
	}
	return true, ""
}

func existsUrl(url string) (bool, error) {
	resp, err := http.Get(url)
	if err != nil {
		return false, fmt.Errorf("http request failed: %v", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case 404:
		return false, nil
	case 403:
		return true, nil
	default:
		return false, errors.New("unexpected status code")
	}
}

func isValidBucketName(s3BucketName string) (bool, string) {
	valid, err := regexp.MatchString(`^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$`, s3BucketName)
	if err == nil && (len(s3BucketName) < 3 || len(s3BucketName) > 63 ||
		strings.HasPrefix(s3BucketName, "xn--") || strings.HasSuffix(s3BucketName, "-s3alias")) {
		valid = false
	}
	if err != nil {
		return false, fmt.Sprintf("error validating bucket name: %v", err)
	}

	if valid {
		return true, ""
	} else {
		errMsg := "Invalid bucket name:\n    1-) Bucket names must be between 3 (min) and 63 (max) characters long.\n    2-) Bucket names can consist only of lowercase letters, numbers, and hyphens (-).\n    3-) Bucket names must not be formatted as an IP address.\n    4-) Bucket names must not start with the prefix 'xn--'.\n    5-) Bucket names must not end with the suffix '-s3alias'."
		return false, errMsg
	}
}

func checkIfAwsS3BucketNameIsValid(s3BucketName, s3BucketType string) (bool, string) {
	isValid, errMsg := isValidBucketName(s3BucketName)
	if isValid {
		if s3BucketType == "Cloud AWS S3" {
			urlAwsS3Bucket := fmt.Sprintf("https://%s.s3.amazonaws.com", s3BucketName)
			existBucket, err := existsUrl(urlAwsS3Bucket)
			if err != nil {
				return false, fmt.Sprintf("cannot find out if bucket exists: %v", err)
			}

			if existBucket {
				return false, fmt.Sprintf("A bucket with the name: %s already exists in AWS.", s3BucketName)
			}
			return true, ""
		}
		return true, ""
	} else {
		return false, errMsg
	}
}

func fileExists(filePath string) (bool, string) {
	_, err := os.Stat(filePath)
	// Si no hay error, el archivo existe
	if err == nil {
		return true, ""
	}
	// Si el error es de tipo "archivo no encontrado", el archivo no existe
	if os.IsNotExist(err) {
		return false, "File does not exist"
	}
	return false, "Error checking if file exists"
}

func Run(value string, prompt string, rules []string, data map[string]string) (bool, string) {
	errMsg := ""
	isValid := true
	for _, rule := range rules {
		if rule == "required" && value == "" {
			errMsg = fmt.Sprintf("Error: '%s' is required", prompt)
			isValid = false
			break
		}
		if rule == "string" {
			isValid, errMsg = isString(value, prompt)
			if !isValid {
				break
			}
		}

		if rule == "int" {
			isValid, errMsg = isInt(value, prompt)
			if !isValid {
				break
			}
		}

		if rule == "float" {
			isValid, errMsg = isFloat(value, prompt)
			if !isValid {
				break
			}
		}

		if rule == "bool" {
			isValid, errMsg = isBool(value, prompt)
			if !isValid {
				break
			}
		}

		if len(rule) >= 6 && rule[:6] == "minlen" {
			minlen, err := strconv.Atoi(rule[7:])
			if err != nil {
				errMsg = fmt.Sprintf("Error: '%s' is not a valid rule", rule)
				isValid = false
				break
			}
			if len(value) < minlen {
				errMsg = fmt.Sprintf("Error: '%s' must be at least %d characters long", prompt, minlen)
				isValid = false
				break
			}
		}

		if len(rule) >= 6 && rule[:6] == "maxlen" {
			maxlen, err := strconv.Atoi(rule[7:])
			if err != nil {
				errMsg = fmt.Sprintf("Error: '%s' is not a valid rule", rule)
				isValid = false
				break
			}
			if len(value) > maxlen {
				errMsg = fmt.Sprintf("Error: '%s' must be at most %d characters long", prompt, maxlen)
				isValid = false
				break
			}
		}

		if len(rule) >= 6 && rule[:6] == "minval" {
			minVal := rule[7:]
			isValid, errMsg = minValue(value, minVal, prompt)
			if !isValid {
				break
			}
		}

		if len(rule) >= 6 && rule[:6] == "maxval" {
			maxVal := rule[7:]
			isValid, errMsg = maxValue(value, maxVal, prompt)
			if !isValid {
				break
			}
		}

		if rule == "email" {
			isValid, errMsg = isEmail(value, prompt)
			if !isValid {
				break
			}
		}

		if rule == "ip" {
			isValid, errMsg = isIPAdress(value, prompt)
			if !isValid {
				break
			}
		}

		if rule == "password" {
			isValid, errMsg = password(value, prompt)
			if !isValid {
				break
			}
		}

		if rule == "matchPrevious" {
			isValid, errMsg = matchPrevious(value, data["previousValue"], prompt)
			if !isValid {
				break
			}
		}

		if rule == "timeZone" {
			isValid, errMsg = checkTimeZone(value)
			if !isValid {
				break
			}
		}

		if rule == "country" {
			isValid, errMsg = isValidCountry(value)
			if !isValid {
				break
			}
		}

		if rule == "url" {
			isValid, errMsg = isValidUrl(value)
			if !isValid {
				break
			}
		}

		if rule == "s3BucketName" {
			isValid, errMsg = checkIfAwsS3BucketNameIsValid(value, data["s3BucketType"])
			if !isValid {
				break
			}
		}

		if rule == "fileExists" {
			isValid, errMsg = fileExists(value)
			if !isValid {
				break
			}
		}

		if rule == "domainCertsType" {
			isValid = false
			deploymentLocation := data["deploymentLocation"]

			if value == "No certs" {
				if deploymentLocation == "Local deployment" {
					isValid = true
				} else {
					errMsg = "No certs case is only allowed for local deployments"
					break
				}
			} else if value == "Let's encrypt certs and AWS Route 53" {
				if deploymentLocation == "AWS cluster deployment" {
					isValid = true
				} else {
					errMsg = "Let's encrypt certs option is only available for AWS cluster deployment"
					break
				}
			} else if value == "AWS Certificate Manager" {
				if deploymentLocation == "AWS cluster deployment" {
					isValid = true
				} else {
					errMsg = "AWS Certificate Manager option is only available for AWS cluster deployment"
					break
				}
			} else if value == "Certs provided by an CA" {
				isValid = true
			}
		}

		if rule == "confirmAnswers" {
			isValid = false
			if value == "yes" ||
				value == "no" ||
				value == "y" ||
				value == "n" ||
				value == "YES" ||
				value == "NO" ||
				value == "Y" ||
				value == "N" {
				isValid = true
			}
			if !isValid {
				errMsg = fmt.Sprintf("Error: '%s' must be 'yes' or 'no'", prompt)
				break
			}
		}

	}
	return isValid, errMsg
}
