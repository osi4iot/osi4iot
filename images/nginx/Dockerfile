FROM nginx
#COPY /static/ /static/
COPY /templates/default.conf /etc/nginx/templates/default.conf.template
COPY entry_script.sh /src/scripts/entry_script.sh
RUN chmod +x /src/scripts/entry_script.sh
ENTRYPOINT ["/src/scripts/entry_script.sh"]


