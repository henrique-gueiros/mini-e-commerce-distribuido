FROM node:20-alpine
WORKDIR /app
EXPOSE 5003
COPY package.json .
RUN npm install --production
COPY . .
CMD ["node", "index.js"]
