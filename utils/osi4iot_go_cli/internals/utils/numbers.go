package utils

type Number interface {
    int | int8 | int16 | int32 | int64 | uint | uint8 | uint16 | uint32 | uint64 | float32 | float64
}

type Integer interface {
	int | int8 | int16 | int32 | int64 | uint | uint8 | uint16 | uint32 | uint64
}


// Average calculates the average of a slice of numeric values
func Average[T Number](slice []T) float64 {
    var sum T
    for _, v := range slice {
        sum += v
    }
    return float64(sum) / float64(len(slice))
}

func Sum[T Number](slice []T) T {
	var sum T
	for _, v := range slice {
		sum += v
	}
	return sum
}

func Max[T Number](a, b T) T {
	if a > b {
		return a
	}
	return b
}

func Min[T Number](a, b T) T {
	if a < b {
		return a
	}
	return b
}


// IsEvenInt checks if an integer is even.
func IsEven[T Integer](n T) bool {
	return n%2 == 0
}

// IsOddInt checks if an integer is odd.
func IsOdd[T Integer](n T) bool {
	return n%2 != 0
}