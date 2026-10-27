# Actualización del frontend (octubre 2026)

Actualización completa de todas las dependencias del servicio `frontend` a su última versión, con las
adaptaciones de código necesarias. Esto se ha verificado:

- `pnpm install --frozen-lockfile` + `pnpm build` en una copia limpia (lo mismo que hace el `Dockerfile`).
- `pnpm typecheck` (TypeScript 7): sin errores nuevos. Solo queda un error previo, descrito en «Problemas previos».
- `pnpm test` (Vitest): 11 tests nuevos de tablas, modales y datepicker.
- Pruebas en Chromium real (WebGL) comparando **la versión antigua y la nueva lado a lado** con los mismos datos:
  visor 3D (modelo glTF, panel dat.gui, selección por clic, resaltado), escala de colores FEM y leyenda,
  vista Pipeline (React Flow, editor con autocompletado y diagnósticos TypeScript), login y rutas protegidas,
  tablas (paginación, orden, filtros, filtro global), modales, mapa Leaflet, tutorial PDF, cámara y NATS
  (contra un `nats-server` real).

## Versiones principales

| Paquete | Antes | Ahora |
|---|---|---|
| react / react-dom | 17.0.2 | 19.3.1 |
| three / @types/three | 0.137.5 / 0.134 | 0.186.1 / 0.186 |
| @react-three/fiber | 7.0 | 9.8 |
| @react-three/drei | 8.8 | 10.7 |
| react-router-dom 5 | 5.2 | **react-router 8.5** (react-router-dom ya no existe) |
| react-table | 7.7 | **@tanstack/react-table 9.3** |
| styled-components | 5.3 | 6.6 |
| react-leaflet | 3.2 | 5.0 |
| react-pdf | 5.7.2 | 11.0 (pdfjs-dist 6.3) |
| react-toastify | 7 | 11 |
| react-select | 4 | 5 |
| react-datepicker | 4 | 9 |
| react-loader-spinner | 4 | 8 |
| use-file-picker | 1 | 2 |
| yup | 0.32 | 1.7 |
| nats.ws (deprecado) | 1.30 | **@nats-io/nats-core 3.4** |
| @turf/* | 6.5 | 7.4 |
| typescript | 6.0 | 7.0 (nativo) + `@typescript/typescript6` para el editor del Pipeline |
| vite / plugin-react | 8.0 | 8.3 / 6.1 |
| express / http-proxy-middleware (proxy dev) | 4 / 2 | 5 / 4 |
| Tests | react-scripts + jest (no funcionaban) | Vitest 5 + Testing Library 16 + jsdom |

Se han eliminado los `@types/*` que ya incluyen las propias librerías, `web-vitals` y `@types/react-speech-kit`
(no se usaban), y el fichero de tipos de react-table v7 (`src/types/react-table-config.d.ts`).

## Cambios por área

### React 19
- `src/index.tsx`: `ReactDOM.render` → `createRoot`.
- **Se ha quitado `<React.StrictMode>`**. En React 18+ hace montar → desmontar → montar cada componente en
  desarrollo, y varios efectos de la app no están preparados (conexiones MQTT/NATS, workers,
  `URL.revokeObjectURL` del glTF). React 17 no lo hacía, así que quitarlo mantiene el comportamiento.
  Puede reactivarse cuando esos efectos sean idempotentes.
- Tipos: `JSX.Element` global → `ReactNode`/`React.JSX`. `ChildrenProp.children` ahora es opcional.

### three.js r186 + React Three Fiber 9 + drei 10
- `outputEncoding/sRGBEncoding` → `outputColorSpace/SRGBColorSpace`; `texture.encoding` → `texture.colorSpace`
  (`loadAndParseGltfFile.ts`).
- `physicallyCorrectLights` ya no existe: las luces físicas son ahora el modo por defecto (la app ya lo usaba).
- `shadows="percentage"`: three r186 eliminó `PCFSoftShadowMap` (usaba PCF de todos modos).
- Se eliminan los apaños `const GroupComponent = 'group' as any`: ahora se usan `<group>`, `<mesh>`,
  `<primitive>` y las luces con sus tipos reales, así que el código 3D vuelve a tener comprobación de tipos.
- `THREE.Event` (tipo eliminado) y el namespace global `THREE` (antes lo exponían los tipos antiguos) → import explícito.
- **Gestión de color**: three ≥ r152 interpreta los colores hexadecimales definidos en el código como sRGB.
  Con el mismo modelo glTF, la comparación lado a lado da imágenes prácticamente idénticas. La escala FEM sale
  algo más saturada en los extremos, y ahora coincide mejor con la leyenda. Para recuperar exactamente el
  aspecto antiguo, pon `LEGACY_COLOR_MANAGEMENT = true` en `DigitalTwin3DViewer/Utils/constants.ts`.
- `react-dat-gui` (sin mantenimiento) funciona con React 19, pero su campo `exports` apunta al build CJS y
  con Vite 8.3 el import por defecto llegaba como objeto (el panel de control fallaba al abrirse). Se fuerza
  su build ESM con un alias en `vite.config.ts`.
- Aviso inofensivo en consola: `THREE.Clock: This module has been deprecated` (viene de R3F 9).

### react-router 8
- `Switch`/`Redirect`/`useHistory` → `Routes`/`Navigate`/`useNavigate`. Las rutas protegidas
  (`PrivateRoute`, `PrivateRouteWithUserRole`, `PublicRoute`) son ahora envoltorios de elementos.
- `NavLink exact` → `end`.
- **Corrección de comportamiento**: react-router 7+ hace las navegaciones dentro de `startTransition`. Por eso,
  tras iniciar sesión desde una ruta protegida, el `<Navigate to="/">` de `PublicRoute` ganaba al
  `navigate(from)` del login y se acababa en `/` en lugar de volver a la página pedida. `PublicRoute` ahora
  respeta `state.from`.

### Tablas: react-table v7 → TanStack Table v9
- Nuevo módulo `PlatformAssistant/Utils/platformTable.tsx` con las *features* de TanStack v9 y una capa de
  compatibilidad. **Las ~30 definiciones de columnas (`TableColumns/`) no se han tocado**: siguen con el formato
  v7 (`Header`, `accessor`, `Cell`, `filter`, `disableFilters`, `disableSortBy`) y se convierten
  a `ColumnDef` v9. Solo ha cambiado su import (`Column` sale ahora de `platformTable`).
- Se reproduce la semántica de v7: filtro por defecto «contiene» sin mayúsculas, `filter: 'equals'` con `==`,
  orden alfanumérico ascendente primero, filtro global (con debounce de 200 ms) sobre todas las columnas,
  vuelta a la página 1 al ordenar o filtrar, y las mismas props en los `Cell` (`row.id`, `row.index`,
  `row.original`, `row.cells[n].value`, `rows`...).
- Las tres tablas (`TableWithPagination`, `TableWithPaginationAndRowSelection`, `TableWithPaginationAsync`)
  están reescritas con la API v9 y mantienen el mismo marcado y estilos.
- Pequeña mejora: hacer clic en el campo de filtro de una cabecera ya no cambia la ordenación (en v7 sí).
- Si se vuelven a crear las columnas en cada render (`Create_X_COLUMNS(refresh)` en línea), la tabla ya no
  remonta las celdas ni pierde la página: usa siempre la última versión de los `Cell`.

### styled-components 6
- v6 ya no filtra las props personalizadas antes de pasarlas al DOM. Se restablece el comportamiento de v5
  con un `StyleSheetManager` global (`src/styledComponentsConfig.ts` + `@emotion/is-prop-valid`).
- **Selectores anidados**: en v6, `:hover`, `:nth-child(...)` o `::-webkit-scrollbar` sin `&` pasan a ser
  selectores *descendientes*. Se han corregido 178 selectores en 44 ficheros (`:x` → `&:x`): rayado de
  filas de las tablas, barras de scroll personalizadas, barras de progreso...

### Otras librerías
- **react-toastify 11**: tema `colored` sin iconos, para mantener el aspecto de la v7 (con el tema claro
  por defecto, el texto blanco de la app no se leía). El CSS se inyecta solo.
- **react-pdf 11**: el worker de pdf.js se sirve desde el bundle (antes CDN de cdnjs). Se usa
  `suspense={false}` para conservar el loader y el mensaje de error: con Suspense, un fallo al cargar el PDF
  desmontaba la app. Se importa `TextLayer.css`.
- **react-loader-spinner 8**: adaptador `Tools/OvalSpinner.tsx` (los loaders ya no aceptan `className` ni `type`).
- **react-select 5**: `OptionsType`/`ValueType` → `Options`/`SingleValue`.
- **react-datepicker 9**: `onChange` recibe `Date | null`; `dayClassName` devuelve cadena.
- **use-file-picker 2**: devuelve un objeto (`openFilePicker`, `filesContent`...) en lugar de una tupla.
- **yup 1**: `when(..., { then: Yup.string()... })` → `then: (schema) => schema...`; `oneOf([ref, null])` → `oneOf([ref])`.
- **react-html5-camera-photo**: solo publica un build CJS y su import por defecto llegaba como objeto (la cámara
  móvil no se mostraba). Se resuelve el componente en `MobilePhotoForm.tsx`.
- **NATS**: `nats.ws` está deprecado. Se migra a `@nats-io/nats-core` v3 (`connect` → `wsconnect`). v3 eliminó
  `StringCodec`, así que hay un equivalente en `src/tools/natsCodec.ts` con la misma API.
- **Editor del Pipeline**: TypeScript 7 es un binario nativo sin API en JavaScript. El language service del
  worker usa `@typescript/typescript6` (paquete oficial de Microsoft).
- **Proxy de desarrollo** (`server.js`): pasa a ESM (`"type": "module"` en `package.json`), Express 5 y
  http-proxy-middleware 4 (`logLevel` → `logger`).
- **Tests**: `pnpm test` (Vitest + jsdom). Nuevo script `pnpm typecheck`.

## Qué conviene probar a mano (necesita backend real)
1. Visor 3D con un gemelo digital real **con resultados FEM**: colores de la escala, deformación, workers
   con SharedArrayBuffer, animaciones.
2. Mapa de geolocalización con datos reales (edificios, plantas, sensores y activos).
3. Simulador de gemelo digital y formularios de sensores móviles (NATS/MQTT reales).
4. Asistente de chat con voz (react-speech-recognition 4; su API es la misma).

## Problemas previos detectados (no causados por la actualización)
- `src/components/Tools/DigitalTwinSimulatorOptions.tsx` es una copia casi exacta de
  `DigitalTwinSimulatorSelectForm.tsx`: exporta el formulario de selección y no acepta `mqttClient`. En
  `DigitalTwinSimulatorMobilePage`, el segundo paso del simulador muestra el componente equivocado. Es el
  único error de TypeScript que queda. Parece que el componente original se sobrescribió; habría que recuperarlo.
- `Dockerfile.arm64` está obsoleto (usa yarn, un `yarn.lock` inexistente y la carpeta `build` de CRA). El build
  multiplataforma de `build_image.sh` usa el `Dockerfile` principal, que sí está al día.
- En la versión antigua, `react-speech-recognition` 3 fallaba en desarrollo con
  `regeneratorRuntime is not defined`. La v4 lo corrige.

## Posibles siguientes pasos
- `paho-mqtt` (sin cambios desde 2018) → `mqtt` (MQTT.js).
- Sustituir `react-dat-gui`, `react-modal-hook` y `react-html5-camera-photo` (sin mantenimiento desde 2022)
  por alternativas activas (`leva`, modales propios, `react-webcam`).
- Dividir el bundle con `import()` dinámico (Vite avisa de chunks > 500 kB: three, pdf.js, TypeScript).
