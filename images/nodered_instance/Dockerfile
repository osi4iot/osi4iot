FROM ghcr.io/osi4iot/nodered_debian:latest
#FROM nodered/node-red:2.2.2-16

ARG TARGETARCH

COPY --chown=node-red:node-red flows.json /tmp
COPY --chown=node-red:node-red settings.js /tmp
COPY --chown=node-red:node-red ml_models.js /tmp
COPY entry_script.sh /src/scripts/entry_script.sh
USER root
RUN chmod +x /src/scripts/entry_script.sh

USER node-red

RUN npm install needle

RUN npm install node-red-contrib-tfjs-coco-ssd
RUN if [ "$TARGETARCH" = "arm64" ] ; then cd /usr/src/node-red && npm rebuild @tensorflow/tfjs-node --build-from-source; fi
RUN npm install node-red-node-base64
RUN npm install node-red-dashboard
RUN npm install node-red-contrib-image-output
RUN npm install node-red-contrib-image-tools
RUN npm install node-red-contrib-browser-utils

ENTRYPOINT ["/src/scripts/entry_script.sh"]
