FROM nodered/node-red:2.2.2-14

COPY --chown=node-red:node-red flows_cred.json /tmp
COPY --chown=node-red:node-red settings.js /tmp
COPY entry_script.sh /src/scripts/entry_script.sh
USER root
RUN chmod +x /src/scripts/entry_script.sh
USER node-red

RUN npm install needle

ENTRYPOINT ["/src/scripts/entry_script.sh"]
