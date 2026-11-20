// The viewer configuration with its images in one .zip: the configuration file (.json, "format":
// "osi4iot-viewer-config") and the images of its Picture panels, at the root of the zip or in a folder
// viewerImages/. The Viewer downloads it (Configuration › Download) when the layout has images, and the Viewer and
// the create and edit forms of a digital twin load it like the .json: the images are uploaded to the twin's files
// (folder viewerImages) when the configuration is saved.
//
// A zip is checked before anything is decompressed (the sizes its directory gives): at most
// VIEWER_PACKAGE_MAX_FILES files and VIEWER_PACKAGE_MAX_BYTES once decompressed, so that a small zip that would
// decompress into something huge does not hang the browser.
import { strFromU8, strToU8, unzipSync, zipSync, Zippable } from "fflate";
import { downloadBlob, VIEWER_CONFIG_FORMAT } from "./viewerConfig";
import { VIEWER_IMAGE_MAX_BYTES, VIEWER_IMAGE_NAME, VIEWER_IMAGES_FOLDER } from "./viewerImagesApi";
import { WorkspaceLayout } from "./workspaceLayout";

export const VIEWER_PACKAGE_MAX_FILES = 100;
export const VIEWER_PACKAGE_MAX_BYTES = 50 * 1024 * 1024;

export interface PackageImage {
    fileName: string;
    data: Uint8Array;
}

export interface ViewerPackage {
    // the configuration file in the zip, and its text
    configName: string;
    configText: string;
    images: PackageImage[];
    // what was left out, and why
    ignored: string[];
}

export const isZipName = (name: string) => /\.zip$/i.test(name);

const baseName = (path: string) => path.split("/").pop() ?? path;

// folders, and what macOS and Windows add to a zip (__MACOSX/, .DS_Store, Thumbs.db)
const isNoise = (path: string) =>
    path.endsWith("/") || path.startsWith("__MACOSX/") || baseName(path).startsWith(".") || /^thumbs\.db$/i.test(baseName(path));

const isConfigText = (text: string) => {
    try {
        const value = JSON.parse(text);
        return value !== null && typeof value === "object" && value.format === VIEWER_CONFIG_FORMAT;
    } catch {
        return false;
    }
};

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 2 : 1)} MB`;

// The configuration and the images of a zip, or why it cannot be loaded
export const readViewerPackage = (bytes: Uint8Array): ViewerPackage | { error: string } => {
    let files = 0;
    let total = 0;
    let tooBig = "";
    let entries: Record<string, Uint8Array>;
    try {
        entries = unzipSync(bytes, {
            filter: (info) => {
                if (isNoise(info.name) || tooBig) return false;
                files++;
                total += info.originalSize;
                if (files > VIEWER_PACKAGE_MAX_FILES) tooBig = `The zip has more than ${VIEWER_PACKAGE_MAX_FILES} files.`;
                else if (total > VIEWER_PACKAGE_MAX_BYTES)
                    tooBig = `The zip has more than ${megabytes(VIEWER_PACKAGE_MAX_BYTES)} once decompressed.`;
                return !tooBig;
            },
        });
    } catch {
        return { error: "The file is not a valid zip." };
    }
    if (tooBig) return { error: tooBig };

    let configName = "";
    let configText = "";
    const images: PackageImage[] = [];
    const ignored: string[] = [];
    const imageNames = new Set<string>();
    // the configuration first: viewer_config.json, else the first .json that is a configuration
    const paths = Object.keys(entries).sort((a, b) => Number(baseName(b) === "viewer_config.json") - Number(baseName(a) === "viewer_config.json"));
    for (const path of paths) {
        const data = entries[path];
        const name = baseName(path);
        const folder = path.slice(0, path.length - name.length).replace(/\/$/, "");
        if (/\.json$/i.test(name)) {
            const text = strFromU8(data);
            if (isConfigText(text)) {
                if (!configName) {
                    configName = path;
                    configText = text;
                } else ignored.push(`${path}: a second viewer configuration (${configName} is used)`);
            } else ignored.push(`${path}: not a viewer configuration`);
            continue;
        }
        if (/\.(png|jpe?g|webp|gif|svg)$/i.test(name)) {
            if (folder && folder !== VIEWER_IMAGES_FOLDER) ignored.push(`${path}: images go at the root or in ${VIEWER_IMAGES_FOLDER}/`);
            else if (!VIEWER_IMAGE_NAME.test(name)) ignored.push(`${path}: not a valid name for an image (letters, digits, _ . -)`);
            else if (data.length > VIEWER_IMAGE_MAX_BYTES) ignored.push(`${path}: an image must have at most ${megabytes(VIEWER_IMAGE_MAX_BYTES)}`);
            else if (imageNames.has(name)) ignored.push(`${path}: another image has the same name`);
            else {
                imageNames.add(name);
                images.push({ fileName: name, data });
            }
            continue;
        }
        ignored.push(`${path}: not a configuration or an image`);
    }
    if (!configName) return { error: "The zip has no viewer configuration (.json)." };
    images.sort((a, b) => a.fileName.localeCompare(b.fileName));
    return { configName, configText, images, ignored };
};

// The images the Picture panels of a layout show
export const layoutImageNames = (layout: WorkspaceLayout | null | undefined): string[] => {
    const names = new Set<string>();
    for (const slide of layout?.slides ?? []) {
        for (const panel of slide.panels) {
            if (panel.type === "picture" && panel.file) names.add(panel.file);
        }
    }
    return Array.from(names).sort();
};

// What a zip's images mean for a twin: the images that replace one of the twin with the same name, and the images
// its Picture panels show that are neither in the zip nor in the twin
export const packageImageWarnings = (
    layout: WorkspaceLayout | null | undefined,
    images: PackageImage[],
    twinImages: string[] | null,
): { replaces: string[]; missing: string[] } => {
    const inZip = new Set(images.map((image) => image.fileName));
    const inTwin = new Set(twinImages ?? []);
    return {
        replaces: twinImages ? images.map((image) => image.fileName).filter((name) => inTwin.has(name)) : [],
        missing: twinImages ? layoutImageNames(layout).filter((name) => !inZip.has(name) && !inTwin.has(name)) : [],
    };
};

export const packageImagesSize = (images: PackageImage[]) => images.reduce((sum, image) => sum + image.data.length, 0);

export const describePackageImages = (images: PackageImage[]) =>
    images.length === 0 ? "no images" : `${images.length} ${images.length === 1 ? "image" : "images"} (${megabytes(packageImagesSize(images))})`;

// The zip of a configuration and its images (the images, already compressed, are stored as they are; an SVG is
// compressed)
export const buildViewerPackage = (configName: string, configText: string, images: PackageImage[]): Uint8Array => {
    const files: Zippable = { [configName]: strToU8(configText) };
    for (const image of images) {
        files[`${VIEWER_IMAGES_FOLDER}/${image.fileName}`] = [image.data, { level: /\.svg$/i.test(image.fileName) ? 6 : 0 }];
    }
    return zipSync(files);
};

// The zip to the user's computer: named as the configuration file would be (fileName, .json), with the
// configuration inside as viewer_config.json
export const downloadViewerPackage = (fileName: string, configText: string, images: PackageImage[]) =>
    downloadBlob(
        new Blob([buildViewerPackage("viewer_config.json", configText, images) as BlobPart], { type: "application/zip" }),
        fileName.replace(/\.json$/i, "") + ".zip",
    );
