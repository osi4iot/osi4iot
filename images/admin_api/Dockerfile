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
USER node
RUN npm install --only=production
COPY --from=0 /app/build ./build
CMD [ "node", "./build/index.js"]
EXPOSE 3200