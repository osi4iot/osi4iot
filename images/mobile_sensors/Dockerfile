FROM nginx
COPY /nginx.conf	/etc/nginx/nginx.conf
#COPY /server.crt	/etc/nginx/server.crt
#COPY /server.key	/etc/nginx/server.key
COPY /static	    /static
HEALTHCHECK --interval=10s --timeout=3s \
  CMD curl -f http://localhost/health || exit 1
