# FROM ghcr.io/osi4iot/nodered_debian:latest
FROM nodered/node-red:latest-debian

ARG TARGETARCH

COPY --chown=node-red:node-red flows.json /tmp
COPY --chown=node-red:node-red settings.js /tmp
COPY --chown=node-red:node-red ml_models.js /tmp
COPY --chown=node-red:node-red pyodide_init.js /tmp
COPY --chown=node-red:node-red python_libraries.js /tmp
COPY --chown=node-red:node-red initialization.js /tmp
COPY entry_script.sh /src/scripts/entry_script.sh
USER root
RUN chmod +x /src/scripts/entry_script.sh
RUN chown -R node-red:node-red /data

USER node-red

RUN npm install needle

RUN npm install @tensorflow/tfjs-node@4.13.0
RUN if [ "$TARGETARCH" = "arm64" ] ; then cd /usr/src/node-red && npm rebuild @tensorflow/tfjs-node --build-from-source; fi
RUN npm install jimp

RUN npm install node-red-contrib-tfjs-coco-ssd
RUN npm install node-red-node-base64
RUN npm install node-red-dashboard
RUN npm install node-red-contrib-image-output
RUN npm install node-red-contrib-image-tools
RUN npm install node-red-contrib-browser-utils
RUN npm install pyodide

ENTRYPOINT ["/src/scripts/entry_script.sh"]
