/**
 * Adapted from https://github.com/Whoaa512/three-lut
 */
import * as THREE from 'three';


export const ColorMapKeywords: Record<string, [number, number][]> = {
    rainbow: [[0.0, 0x0000FF], [0.2, 0x00FFFF], [0.5, 0x00FF00], [0.8, 0xFFFF00], [1.0, 0xFF0000]],
    cooltowarm: [[0.0, 0x3C4EC2], [0.2, 0x9BBCFF], [0.5, 0xDCDCDC], [0.8, 0xF6A385], [1.0, 0xB40426]],
    blackbody: [[0.0, 0x000000], [0.2, 0x780000], [0.5, 0xE63200], [0.8, 0xFFFF00], [1.0, 0xFFFFFF]],
    grayscale: [[0.0, 0x000000], [0.2, 0x404040], [0.5, 0x7F7F80], [0.8, 0xBFBFBF], [1.0, 0xFFFFFF]]

};

export interface ILegendLabels {
    title: THREE.Sprite;
    ticks: THREE.Sprite[];
    lines: THREE.Line<any, THREE.LineBasicMaterial>[];
};

class Lut {
    lut: THREE.Color[];
    map: [number, number][];
    n: number;
    minV: number;
    maxV: number;
    legend: any;
    mapname: string;
    layout: string;

    constructor(colormap: string = 'rainbow', numberofcolors: number = 256) {

        this.lut = [];
        this.map = ColorMapKeywords[colormap];
        this.n = numberofcolors;
        this.mapname = colormap;
        this.minV = 0;
        this.maxV = 1;
        this.legend = null;
        this.layout = 'vertical';

        const step = 1.0 / this.n;
        for (let i = 0; i <= 1; i += step) {
            for (let j = 0; j < this.map.length - 1; j++) {
                if (i >= this.map[j][0] && i < this.map[j + 1][0]) {
                    var min = this.map[j][0];
                    var max = this.map[j + 1][0];
                    var color = new THREE.Color(0xffffff);
                    var minColor = new THREE.Color(0xffffff).setHex(this.map[j][1]);
                    var maxColor = new THREE.Color(0xffffff).setHex(this.map[j + 1][1]);
                    color = minColor.lerp(maxColor, (i - min) / (max - min));
                    this.lut.push(color);
                }
            }
        }
    }

    set(value: Lut) {
        if (value instanceof Lut) {
            this.copy(value);
        }
        return this;
    }

    setMin(min: number) {
        this.minV = min;
        return this;
    }

    setMax(max: number) {
        this.maxV = max;
        return this;
    }

    changeNumberOfColors(numberofcolors: number) {
        this.n = numberofcolors;
        return new Lut(this.mapname, this.n);
    }

    changeColorMap(colormap: string) {
        this.mapname = colormap;
        return new Lut(this.mapname, this.n);

    }

    copy(lut: Lut) {
        this.lut = lut.lut;
        this.mapname = lut.mapname;
        this.map = lut.map;
        this.n = lut.n;
        this.minV = lut.minV;
        this.maxV = lut.maxV;
        return this;
    }

    getColor(alpha: number) {
        if (alpha <= this.minV) {
            alpha = this.minV;
        } else if (alpha >= this.maxV) {
            alpha = this.maxV;
        }
        alpha = (alpha - this.minV) / (this.maxV - this.minV);
        var colorPosition = Math.round(alpha * this.n);
        if (colorPosition === this.n) colorPosition -= 1;
        return this.lut[colorPosition];
    }

    addColorMap(colormapName: string, arrayOfColors: [number, number][]): void {
        ColorMapKeywords[colormapName] = arrayOfColors;
    }

    setLegendOn(parameters?: any) {
        if (parameters === undefined) {
            parameters = {};
        }
        this.legend = {};
        this.legend.layout = parameters.hasOwnProperty('layout') ? parameters['layout'] : 'vertical';
        this.legend.position = parameters.hasOwnProperty('position') ? parameters['position'] : { 'x': 9.4, 'y': 9, 'z': 5 };
        this.legend.dimensions = parameters.hasOwnProperty('dimensions') ? parameters['dimensions'] : { 'width': 1.5, 'height': 9 };
        this.legend.canvas = document.createElement('canvas');
        this.legend.canvas.setAttribute('id', 'legend');
        this.legend.canvas.setAttribute('hidden', true);
        document.body.appendChild(this.legend.canvas);
        this.legend.ctx = this.legend.canvas.getContext('2d');
        this.legend.canvas.setAttribute('width', 1);
        this.legend.canvas.setAttribute('height', this.n);
        this.legend.texture = new THREE.Texture(this.legend.canvas);
        let imageData = this.legend.ctx.getImageData(0, 0, 1, this.n);
        let data = imageData.data;
        this.map = ColorMapKeywords[this.mapname];
        var k = 0;
        var step = 1.0 / this.n;

        for (var i = 1; i >= 0; i -= step) {
            for (var j = this.map.length - 1; j >= 0; j--) {
                if (i < this.map[j][0] && i >= this.map[j - 1][0]) {

                    var min = this.map[j - 1][0];
                    var max = this.map[j][0];
                    var color = new THREE.Color(0xffffff);
                    var minColor = new THREE.Color(0xffffff).setHex(this.map[j - 1][1]);
                    var maxColor = new THREE.Color(0xffffff).setHex(this.map[j][1]);
                    color = minColor.lerp(maxColor, (i - min) / (max - min));

                    data[k * 4] = Math.round(color.r * 255);
                    data[k * 4 + 1] = Math.round(color.g * 255);
                    data[k * 4 + 2] = Math.round(color.b * 255);
                    data[k * 4 + 3] = 255;
                    k += 1;
                }
            }
        }

        this.legend.ctx.putImageData(imageData, 0, 0);
        this.legend.texture.needsUpdate = true;

        this.legend.legendGeometry = new THREE.PlaneBufferGeometry(this.legend.dimensions.width, this.legend.dimensions.height);
        this.legend.legendMaterial = new THREE.MeshBasicMaterial({ map: this.legend.texture, side: THREE.DoubleSide });

        this.legend.mesh = new THREE.Mesh(this.legend.legendGeometry, this.legend.legendMaterial);

        if (this.legend.layout === 'horizontal') {
            this.legend.mesh.rotation.z = - 90 * (Math.PI / 180);
        }

        this.legend.mesh.position.copy(this.legend.position);
        return this.legend.mesh;
    }

    setLegendOff() {
        this.legend = null;
        return this.legend;
    }

    setLegendLayout(layout: string) {
        if (!this.legend) {
            return false;
        }

        if (this.legend.layout === layout) {
            return false;
        }

        if (layout !== 'horizontal' && layout !== 'vertical') {
            return false;
        }

        this.layout = layout;
        if (layout === 'horizontal') {
            this.legend.mesh.rotation.z = 90 * (Math.PI / 180);
        }

        if (layout === 'vertical') {
            this.legend.mesh.rotation.z = - 90 * (Math.PI / 180);
        }
        return this.legend.mesh;
    }

    setLegendPosition(position: THREE.Vector3) {
        this.legend.position = new THREE.Vector3(position.x, position.y, position.z);
        return this.legend;
    }

    setLegendLabels(parameters: any, callback?: (value: number) => number): ILegendLabels | boolean {

        if (!this.legend) {
            return false;
        }

        if (typeof parameters === 'function') {
            callback = parameters;
        }

        if (parameters === undefined) {
            parameters = {};
        }

        this.legend.labels = {};

        this.legend.labels.fontsize = parameters.hasOwnProperty('fontsize') ? parameters['fontsize'] : 24;

        this.legend.labels.fontface = parameters.hasOwnProperty('fontface') ? parameters['fontface'] : 'Arial';

        this.legend.labels.title = parameters.hasOwnProperty('title') ? parameters['title'] : '';

        this.legend.labels.um = parameters.hasOwnProperty('um') ? ' [ ' + parameters['um'] + ' ]' : '';

        this.legend.labels.ticks = parameters.hasOwnProperty('ticks') ? parameters['ticks'] : 0;

        this.legend.labels.decimal = parameters.hasOwnProperty('decimal') ? parameters['decimal'] : 4;

        this.legend.labels.notation = parameters.hasOwnProperty('notation') ? parameters['notation'] : 'scientific';

        var backgroundColor = { r: 255, g: 255, b: 255, a: 1.0 };
        var borderColor = { r: 255, g: 255, b: 255, a: 1.0 };
        var borderThickness = 4;

        var canvasTitle = document.createElement('canvas');
        var contextTitle = canvasTitle.getContext('2d');

        if (contextTitle) {
            contextTitle.font = 'Normal ' + this.legend.labels.fontsize * 1.2 + 'px ' + this.legend.labels.fontface;

            contextTitle.fillStyle = 'rgba(' + backgroundColor.r + ',' + backgroundColor.g + ',' + backgroundColor.b + ',' + backgroundColor.a + ')';

            contextTitle.strokeStyle = 'rgba(' + borderColor.r + ',' + borderColor.g + ',' + borderColor.b + ',' + borderColor.a + ')';
            contextTitle.lineWidth = borderThickness;
            contextTitle.fillStyle = 'rgba( 255, 255, 255, 1.0 )';
            contextTitle.fillText(this.legend.labels.title.toString() + this.legend.labels.um.toString(), borderThickness, this.legend.labels.fontsize + borderThickness);
        }

        var txtTitle = new THREE.CanvasTexture(canvasTitle);
        txtTitle.minFilter = THREE.LinearFilter;

        var spriteMaterialTitle = new THREE.SpriteMaterial({ map: txtTitle });

        var spriteTitle = new THREE.Sprite(spriteMaterialTitle);

        spriteTitle.scale.set(6, 3, 1.0);

        if (this.legend.layout === 'vertical') {
            spriteTitle.position.set(this.legend.position.x + 1.3 * this.legend.dimensions.width, this.legend.position.y + (this.legend.dimensions.height * 0.45), this.legend.position.z);
        }

        if (this.legend.layout === 'horizontal') {
            spriteTitle.position.set(this.legend.position.x * 1.015, this.legend.position.y + (this.legend.dimensions.height * 0.03), this.legend.position.z);
        }
        let ticks: THREE.Sprite[] = [];
        let lines: THREE.Line<any, THREE.LineBasicMaterial>[] = [];
        if (this.legend.labels.ticks > 0) {

            let topPositionX = 0;
            let bottomPositionX = 0;
            let topPositionY = 0;
            let bottomPositionY = 0;

            if (this.legend.layout === 'vertical') {
                topPositionY = this.legend.position.y + (this.legend.dimensions.height * 0.36);
                bottomPositionY = this.legend.position.y - (this.legend.dimensions.height * 0.61);
            }

            if (this.legend.layout === 'horizontal') {
                topPositionX = this.legend.position.x + (this.legend.dimensions.height * 0.75);
                bottomPositionX = this.legend.position.x - (this.legend.dimensions.width * 1.2);
            }

            for (let i = 0; i < this.legend.labels.ticks; i++) {
                let value: number | string = (this.maxV - this.minV) / (this.legend.labels.ticks - 1) * i + this.minV;

                if (callback) {
                    value = callback(value);
                } else {
                    if (this.legend.labels.notation === 'scientific') {
                        value = value.toExponential(this.legend.labels.decimal);
                    } else {
                        value = value.toFixed(this.legend.labels.decimal);
                    }
                }

                let canvasTick = document.createElement('canvas');
                let contextTick = canvasTick.getContext('2d');

                if (contextTick) {
                    contextTick.font = 'Normal ' + this.legend.labels.fontsize + 'px ' + this.legend.labels.fontface;
                    contextTick.fillStyle = 'rgba(' + backgroundColor.r + ',' + backgroundColor.g + ',' + backgroundColor.b + ',' + backgroundColor.a + ')';
                    contextTick.strokeStyle = 'rgba(' + borderColor.r + ',' + borderColor.g + ',' + borderColor.b + ',' + borderColor.a + ')';
                    contextTick.lineWidth = borderThickness;
                    contextTick.fillStyle = 'rgba( 255, 255, 255, 1.0 )';
                    contextTick.fillText(value.toString(), borderThickness, this.legend.labels.fontsize + borderThickness);
                }

                let txtTick = new THREE.CanvasTexture(canvasTick);
                txtTick.minFilter = THREE.LinearFilter;
                let spriteMaterialTick = new THREE.SpriteMaterial({ map: txtTick });
                let spriteTick = new THREE.Sprite(spriteMaterialTick);
                // spriteTick.scale.set(2, 1, 1.0);
                spriteTick.scale.set(6, 3, 1.0);

                if (this.legend.layout === 'vertical') {
                    let position = bottomPositionY + (topPositionY - bottomPositionY) * ((parseFloat(value as string) - this.minV) / (this.maxV - this.minV));
                    spriteTick.position.set(this.legend.position.x + (this.legend.dimensions.width * 2.7), position, this.legend.position.z);
                }

                if (this.legend.layout === 'horizontal') {
                    let position = bottomPositionX + (topPositionX - bottomPositionX) * ((parseFloat(value as string) - this.minV) / (this.maxV - this.minV));

                    let offset: number;
                    if (this.legend.labels.ticks > 5) {
                        if (i % 2 === 0) {
                            offset = 1.7;
                        } else {
                            offset = 2.1;
                        }
                    } else {
                        offset = 1.7;
                    }
                    spriteTick.position.set(position, this.legend.position.y - this.legend.dimensions.width * offset, this.legend.position.z);
                }

                var material = new THREE.LineBasicMaterial({ color: 0xFFFFFF, linewidth: 2 });

                var geometry = new THREE.BufferGeometry();


                if (this.legend.layout === 'vertical') {
                    const linePosition = (this.legend.position.y - (this.legend.dimensions.height * 0.5) + 0.01) + (this.legend.dimensions.height) * ((parseFloat(value as string) - this.minV) / (this.maxV - this.minV) * 0.99);

                    const vertices = new Float32Array([
                        this.legend.position.x + this.legend.dimensions.width * 0.55, linePosition, this.legend.position.z,
                        this.legend.position.x + this.legend.dimensions.width * 0.7, linePosition, this.legend.position.z
                    ]);

                    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                }

                if (this.legend.layout === 'horizontal') {
                    const linePosition = (this.legend.position.x - (this.legend.dimensions.height * 0.5) + 0.01) + (this.legend.dimensions.height) * ((parseFloat(value as string) - this.minV) / (this.maxV - this.minV) * 0.99);

                    const vertices = new Float32Array([
                        linePosition, this.legend.position.y - this.legend.dimensions.width * 0.55, this.legend.position.z,
                        linePosition, this.legend.position.y - this.legend.dimensions.width * 0.7, this.legend.position.z
                    ]);

                    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                }

                const line = new THREE.Line(geometry, material);

                lines[i] = line;
                ticks[i] = spriteTick;

            }

        }
        return { title: spriteTitle, ticks: ticks, lines: lines };
    }
};

export default Lut;
