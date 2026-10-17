# => Build container
# => Build container
FROM node:24-alpine AS builder
RUN npm install -g pnpm@12.11.2
WORKDIR /app
COPY ./app/package.json ./app/pnpm-lock.yaml ./app/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY ./app/. .
RUN pnpm build

# => Run container
FROM nginx:1.25.3

# Nginx config
COPY ./nginx.conf /etc/nginx/nginx.conf

# Static build
COPY --from=builder /app/dist /static/

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