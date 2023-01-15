## this is the stage one , also know as the build step

FROM node:lts-alpine
RUN mkdir -p /app/node_modules && chown -R node:node /app
WORKDIR /app
COPY package*.json ./
RUN npm install -g typescript
RUN npm install
COPY . .
RUN npm run build

## this is stage two , where the app actually runs

FROM node:lts-alpine
RUN mkdir -p /app/node_modules && chown -R node:node /app
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache tzdata
RUN apk add --no-cache curl
RUN npm install --only=production
USER node
COPY --from=0 /app/build ./build
CMD npm start
HEALTHCHECK --interval=10s --timeout=300s --retries=30 \
  CMD curl --fail --insecure http://localhost:3200/health || exit 1
EXPOSE 3200
