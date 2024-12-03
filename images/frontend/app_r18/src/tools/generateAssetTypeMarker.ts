const addSvgStringToMarker = (svgString: string) => {
    const markerString = `<svg id="Layer_1" enable-background="new 0 0 512 512" viewBox="0 0 512 512" version="1.1" xml:space="preserve" width="512" height="512" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"><g id="g234" transform="matrix(0.30117645,0,0,0.30117645,-8972.3508,-3.28125e-4)"><rect style="fill:#2a81cb;fill-opacity:1;stroke:none;stroke-width:20;stroke-linecap:butt;stroke-opacity:1" id="rect233" width="1216" height="1216" x="30033.01" y="0" rx="238.26289" ry="238.26289" /><path id="path234" style="fill:#2a81cb;fill-opacity:1;stroke:none;stroke-width:20;stroke-linecap:butt;stroke-opacity:1" d="m 30837.841,1286.6502 -196.836,413.3499 -196.836,-413.3499" /></g>${svgString}</svg>`
    return markerString;
}

const removeSizeAttributesOfElement = (svgElement: SVGSVGElement) => {
    svgElement.removeAttribute("width")
    svgElement.removeAttribute("height");
}

const getScaleForMarker = (svgElement: SVGSVGElement) => {
    const viewBox = svgElement.getAttribute("viewBox");
    let scale = 0.54;
    let translateX = 118;
    let translateY = 45;
    if (viewBox) {
        const viewBoxArray = viewBox.split(" ");
        const sizeX = parseFloat(viewBoxArray[2]) - parseFloat(viewBoxArray[0]);
        const sizeY = parseFloat(viewBoxArray[3]) - parseFloat(viewBoxArray[1]);
        let size = Math.max(sizeX, sizeY);
        if (size !== 0) {
            scale = 512 * 0.54 / size;
        }
        translateX = 73 + (366 - sizeX * scale) / 2;
    }
    return [scale, translateX, translateY];
}

const removeFillAttributesOfElement = (svgElement: SVGSVGElement) => {
    const childNodes = svgElement.children;
    for (let i = 0; i < childNodes.length; i++) {
        const styleString = childNodes[i].getAttribute("style");
        if (styleString) {
            const styleArray = styleString.split(";")
            const newStyleArray = styleArray.filter((item: string | string[]) => !item.includes("fill:"))
            const newStyle = newStyleArray.join(";");
            childNodes[i].setAttribute("style", newStyle);
        }
        if (childNodes[i].hasChildNodes()) {
            removeFillAttributesOfElement(childNodes[i] as SVGSVGElement);
        }
    }
}

const addStyleToHollow = (svgElement: SVGSVGElement) => {
    const childNodes = svgElement.children;
    for (let i = 0; i < childNodes.length; i++) {
        const classString = childNodes[i].getAttribute("class");
        if (classString && classString=== "hollow") {
            const styleString = childNodes[i].getAttribute("style");
            if (styleString) {
                const styleArray = styleString.split(";")
                styleArray.push("fill:#2a81cb");
                const newStyle = styleArray.join(";");
                childNodes[i].setAttribute("style", newStyle);
            } else {
                const newStyle = "fill:#2a81cb";
                childNodes[i].setAttribute("style", newStyle);
            }
        }
        if (childNodes[i].hasChildNodes()) {
            addStyleToHollow(childNodes[i] as SVGSVGElement);
        }
    }

}

export const cleanSvgString = (svgString: string) => {
    var parser = new DOMParser();
    var xmlDoc = parser.parseFromString(svgString, "image/svg+xml");
    const svgElement = xmlDoc.getElementsByTagName('svg')[0];
    removeSizeAttributesOfElement(svgElement);
    removeFillAttributesOfElement(svgElement);
    const newIconSvgString = new XMLSerializer().serializeToString(svgElement);
    return newIconSvgString;
}

export const generateAssetTypeMarker = (iconSvg: string) => {
    var parser = new DOMParser();
    var xmlDoc = parser.parseFromString(iconSvg, "image/svg+xml");
    const svgElement = xmlDoc.getElementsByTagName('svg')[0];
    removeFillAttributesOfElement(svgElement);
    addStyleToHollow(svgElement);
    const [scale, translateX, translateY] = getScaleForMarker(svgElement);

    const wrapperNode = xmlDoc.createElement("g");
    wrapperNode.setAttribute("transform", `translate(${translateX} ${translateY}) scale(${scale})`);
    wrapperNode.setAttribute("style", "fill:#FFFFFF");
    const childNodes = svgElement.childNodes;
    for (let i = 0; i < childNodes.length; i++) {
        const newNode = childNodes[i].cloneNode(true);
        wrapperNode.appendChild(newNode);
    }

    const newIconSvgString = new XMLSerializer().serializeToString(wrapperNode);
    const markerString = addSvgStringToMarker(newIconSvgString);
    return markerString;
}