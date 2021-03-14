FROM nginx
#COPY /static/ /static/
COPY /templates/default.conf /etc/nginx/templates/default.conf.template
COPY entry_script.sh /src/scripts/entry_script.sh
RUN chmod +x /src/scripts/entry_script.sh
HEALTHCHECK --interval=10s --timeout=3s \
  CMD curl -f http://localhost/health || exit 1
ENTRYPOINT ["/src/scripts/entry_script.sh"]


