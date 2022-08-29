# => Build container
FROM node:lts-alpine as builder
WORKDIR /app
COPY ./app/package.json .
COPY ./app/yarn.lock .
RUN yarn --network-timeout 600000
COPY ./app/. .
RUN yarn build

# => Run container
FROM nginx:1.23.1

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