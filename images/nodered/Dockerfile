FROM nodered/node-red:2.0.6-12

COPY --chown=node-red:node-red flows_cred.json /tmp
COPY --chown=node-red:node-red flows.json /tmp
COPY --chown=node-red:node-red settings.js /tmp
COPY entry_script.sh /src/scripts/entry_script.sh
USER root
RUN chmod +x /src/scripts/entry_script.sh
USER node-red

RUN npm install node-red-contrib-re-postgres

ENTRYPOINT ["/src/scripts/entry_script.sh"]
