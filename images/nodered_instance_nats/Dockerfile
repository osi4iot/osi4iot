FROM nodered/node-red:latest-debian
ARG TARGETARCH

COPY --chown=node-red:node-red flows_cred.json flows_mosquitto.json flows_nats.json \
     settings.js ml_models.js pyodide_init.js python_libraries.js initialization.js \
     /tmp/

COPY entry_script.sh /src/scripts/entry_script.sh
USER root
RUN chmod +x /src/scripts/entry_script.sh
RUN chown -R node-red:node-red /data
RUN chown -R node-red:node-red /tmp/flows_mosquitto.json
RUN chown -R node-red:node-red /tmp/flows_nats.json
USER node-red

RUN npm install needle @tensorflow/tfjs-node@4.13.0 jimp \
    node-red-contrib-tfjs-coco-ssd node-red-node-base64 \
    node-red-dashboard node-red-contrib-image-output \
    node-red-contrib-image-tools node-red-contrib-browser-utils \
    @inductiv/node-red-openai-api pyodide

ENTRYPOINT ["/src/scripts/entry_script.sh"]