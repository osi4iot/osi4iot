FROM nodered/node-red:2.0.6-12

COPY --chown=node-red:node-red flows_cred.json /data
COPY --chown=node-red:node-red flows.json /data
COPY --chown=node-red:node-red settings.js /data
COPY entry_script.sh /src/scripts/entry_script.sh
USER root
RUN chmod +x /src/scripts/entry_script.sh
USER node-red

RUN npm install node-red-contrib-re-postgres

ENTRYPOINT ["/src/scripts/entry_script.sh"]

# RUN npm install node-red-dashboard \
#     npm install node-red-contrib-schedex \
#     npm install node-red-contrib-yield \
#     npm install node-red-contrib-re-postgres \
#     npm install node-red-contrib-uuid \
#     npm install node-red-node-email \
#     npm install node-red-contrib-users






