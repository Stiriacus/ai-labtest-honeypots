FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p data uploads/avatars

EXPOSE 3000

CMD ["sh", "-c", "node server/seed.js && node server/index.js"]
