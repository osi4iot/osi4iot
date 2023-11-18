import * as Yup from 'yup';

const definitions: any = {}

// Test an object to see if it is a function
const isFunction = (object: any) => typeof (object) === 'function';

// A truthy test for objects
const isObject = (object: any) => object === Object(object);

// Formats error messages, calls the callback
const _done = (trace: boolean, message: string[]) => {
    let valid = false

    if (typeof message === 'string') {
        message = [message]
    } else if (Object.prototype.toString.call(message) === '[object Array]') {
        if (message.length === 0) {
            valid = true
        }
    } else {
        valid = true
    }

    if (trace) {
        return message
    } else {
        return valid
    }
}

const _customDefinitions = (type: string, object: any) => {
    let errors;

    if (isFunction(definitions.type)) {
        try {
            errors = definitions[type](object)
        } catch (e) {
            errors = ['Problem with custom definition for ' + type + ': ' + e]
        }
        if (typeof errors === 'string') {
            errors = [errors]
        }
        if (Object.prototype.toString.call(errors) === '[object Array]') {
            return errors
        }
    }
    return []
}

const isPosition = (position: any, trace = false) => {
    let errors: string[] = []

    // It must be an array
    if (Array.isArray(position)) {
        // and the array must have more than one element
        if (position.length <= 1) {
            errors.push('Position must be at least two elements')
        }

        position.forEach((pos, index) => {
            if (typeof pos !== 'number') {
                errors.push('Position must only contain numbers. Item ' + pos + ' at index ' + index + ' is invalid.')
            }
        })
    } else {
        errors.push('Position must be an array')
    }

    // run custom checks
    errors = errors.concat(_customDefinitions('Position', position))
    return _done(trace, errors)
}


const _linearRingCoor = (coordinates: any, trace: boolean) => {
    let errors: string[] = []
    if (Array.isArray(coordinates)) {
        // 4 or more positions
        coordinates.forEach((val, index) => {
            const t = isPosition(val, true)
            if (Array.isArray(t) && t.length) {
                // modify the err msg from 'isPosition' to note the element number
                t[0] = 'At ' + index + ': '.concat(t[0])
                // build a list of invalide positions
                errors = errors.concat(t)
            }
        })

        // check the first and last positions to see if they are equivalent
        // TODO: maybe better checking?
        if (coordinates[0].toString() !== coordinates[coordinates.length - 1].toString()) {
            errors.push('The first and last positions must be equivalent')
        }

        if (coordinates.length < 4) {
            errors.push('Coordinates must have at least four positions')
        }
    } else {
        errors.push('Coordinates must be an array')
    }

    return _done(trace, errors)
}


const isPolygonCoor = (coordinates: any, trace = false) => {
    let errors: string[] = []
    if (Array.isArray(coordinates)) {
        coordinates.forEach((val, index) => {
            const t = _linearRingCoor(val, true)
            if (Array.isArray(t) && t.length) {
                // modify the err msg from 'isPosition' to note the element number
                t[0] = 'At ' + index + ': '.concat(t[0])
                // build a list of invalide positions
                errors = errors.concat(t)
            }
        })
    } else {
        errors.push('Coordinates must be an array')
    }

    return _done(trace, errors)
}



const isPolygon = (polygon: any, trace = false) => {
    if (!isObject(polygon)) {
        return _done(trace, ['Must be a JSON Object'])
    }

    let errors: string[] = [];


    if ('type' in polygon) {
        if (polygon.type !== 'Polygon') {
            errors.push('Type must be "Polygon"')
        }
    } else {
        errors.push('Must have a member with the name "type"')
    }

    if ('coordinates' in polygon) {
        const t = isPolygonCoor(polygon.coordinates, true)
        if (Array.isArray(t) && t.length) {
            errors = errors.concat(t)
        }
    } else {
        errors.push('Must have a member with the name "coordinates"')
    }

    // run custom checks
    errors = errors.concat(_customDefinitions('Polygon', polygon))

    return _done(trace, errors)
}


// Determines if an array can be interperted as coordinates for a MultiPolygon
const isMultiPolygonCoor = (coordinates: any, trace = false) => {
    let errors: string[] = []
    if (Array.isArray(coordinates)) {
        coordinates.forEach((val, index) => {
            const t = isPolygonCoor(val, true)
            if (Array.isArray(t) && t.length) {
                // modify the err msg from 'isPosition' to note the element number
                t[0] = 'At ' + index + ': '.concat(t[0])
                // build a list of invalide positions
                errors = errors.concat(t)
            }
        })
    } else {
        errors.push('Coordinates must be an array')
    }

    return _done(trace, errors)
}


const isMultiPolygon = (multiPolygon: any, trace = false) => {
    if (!isObject(multiPolygon)) {
        return _done(trace, ['Must be a JSON Object'])
    }

    let errors: string[] = [];
    if ('type' in multiPolygon) {
        if (multiPolygon.type !== 'MultiPolygon') {
            errors.push('Type must be "MultiPolygon"')
        }
    } else {
        errors.push('Must have a member with the name "type"')
    }

    if ('coordinates' in multiPolygon) {
        const t = isMultiPolygonCoor(multiPolygon.coordinates, true);
        if (Array.isArray(t) && t.length) {
            errors = errors.concat(t)
        }
    } else {
        errors.push('Must have a member with the name "coordinates"')
    }

    // run custom checks
    errors = errors.concat(_customDefinitions('MultiPolygon', multiPolygon))

    return _done(trace, errors)
}

const isGeometryObject = (geometryObject: any, trace = false) => {
    if (!isObject(geometryObject)) {
        return _done(trace, ['Must be a JSON Object'])
    }

    let errors: string[] = []
    if ('type' in geometryObject) {
        if (geometryObject.type === "Polygon") return isPolygon(geometryObject, trace)
        else if (geometryObject.type === "MultiPolygon") return isMultiPolygon(geometryObject, trace)
        else {
            errors.push("Type must be one of: 'Polygon' or 'MultiPolygon'")
        }
    } else {
        errors.push('Must have a member with the name "type"')
    }

    // run custom checks
    errors = errors.concat(_customDefinitions('GeometryObject', geometryObject))
    return _done(trace, errors)
}


// Determines if an object is a valid Feature
const isFeature = (feature: any, trace = false) => {
    if (!isObject(feature)) {
        return _done(trace, ['Must be a JSON Object'])
    }

    let errors: string[] = []

    if ('type' in feature) {
        if (feature.type !== 'Feature') {
            errors.push('Type must be "Feature"')
        }
    } else {
        errors.push('Must have a member with the name "type"')
    }

    if (!('properties' in feature)) {
        errors.push('Must have a member with the name "properties"')
    }

    if ('geometry' in feature) {
        if (feature.geometry !== null) {
            const t = isGeometryObject(feature.geometry, true)
            if (Array.isArray(t) && t.length) {
                errors = errors.concat(t)
            }
        }
    } else {
        errors.push('Must have a member with the name "geometry"')
    }

    // run custom checks
    errors = errors.concat(_customDefinitions('Feature', feature))
    return _done(trace, errors)
}


// Determines if an object is a valid Feature Collection
const isFeatureCollection = (featureCollection: any, trace = false) => {
    if (!isObject(featureCollection)) {
        return _done(trace, ['Must be a JSON Object'])
    }

    let errors: string[] = []

    if ('type' in featureCollection) {
        if (featureCollection.type !== 'FeatureCollection') {
            errors.push('Type must be "FeatureCollection"')
        }
    } else {
        errors.push('Must have a member with the name "type"')
    }

    if ('features' in featureCollection) {
        if (Array.isArray(featureCollection.features)) {
            featureCollection.features.forEach((val: any, index: number) => {
                const t = isFeature(val, true)
                if (Array.isArray(t) && t.length) {
                    // modify the err msg from 'isPosition' to note the element number
                    t[0] = 'At ' + index + ': '.concat(t[0])
                    // build a list of invalide positions
                    errors = errors.concat(t)
                }
            })
        } else {
            errors.push('"Features" must be an array')
        }
    } else {
        errors.push('Must have a member with the name "Features"')
    }

    // run custom checks
    errors = errors.concat(_customDefinitions('FeatureCollection', featureCollection))
    return _done(trace, errors)
}

export const isGeoJSONObject = (geoJSONObject: any, trace = false) => {
    let errors: string[] = []

    if (!isObject(geoJSONObject)) {
        return _done(trace, ['Must be a JSON Object'])
    } else {
        if ('type' in geoJSONObject) {
            if (geoJSONObject.type === "FeatureCollection") return isFeatureCollection(geoJSONObject, trace)
            else {
                errors.push("Type must be one of: 'FeatureCollection'")
            }
        } else {
            errors.push('Must have a member with the name "type"')
        }

        // run custom checks
        errors = errors.concat(_customDefinitions('GeoJSONObject', geoJSONObject))
        return _done(trace, errors)
    }
}

export const isGeoJSONString = (geoJSONString: string, trace = false) => {
    let errors: string[] = []
    if (geoJSONString === "{}") return _done(trace, errors);
    try {
        const geoJSONObject = JSON.parse(geoJSONString);
        return isGeoJSONObject(geoJSONObject, trace);
    } catch (e) {
        return _done(trace, ['Must be a JSON Object'])
    }
}

function geojsonValidation(this: Yup.TestContext<Record<string, any>>, value: any) {
    const { path, createError } = this;
    const errorsArray = isGeoJSONString(value, true);

    let aditionalErrorMessage = ""
    if ((errorsArray as string[]).length !== 0) aditionalErrorMessage += (errorsArray as string[]).join(".");
    return (
        (errorsArray as string[]).length === 0 ||
        createError({ path, message: `Invalid geojson. ${aditionalErrorMessage}` })
    )
};

export default geojsonValidation;
