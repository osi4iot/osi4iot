# FROM nginx
# COPY /nginx.conf	/etc/nginx/nginx.conf
# COPY /static/login /static/login
# COPY /static/register/build /static/register
# HEALTHCHECK --interval=10s --timeout=3s \
# CMD curl -f http://localhost/health || exit 1

# => Build container
FROM node:lts-alpine as builder
WORKDIR /app
COPY ./app/package.json .
COPY ./app/yarn.lock .
RUN yarn
COPY ./app/. .
RUN yarn build

# => Run container
FROM nginx

# Nginx config
COPY ./nginx.conf /etc/nginx/nginx.conf

# Static build
COPY --from=builder /app/build /static/

# Default port exposure
EXPOSE 80

# Copy entry_script.sh script to container
COPY entry_script.sh /src/scripts/entry_script.sh
RUN chmod +x /src/scripts/entry_script.sh

# Setting HEALTHCHECK
HEALTHCHECK --interval=10s --timeout=3s \
    CMD curl -f http://localhost/health || exit 1

# Start Nginx server
ENTRYPOINT ["/src/scripts/entry_script.sh"]