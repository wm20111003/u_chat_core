# 编译
# FROM registry.cn-shenzhen.aliyuncs.com/cyanchat/alinode:build as build
FROM registry.cn-shenzhen.aliyuncs.com/cyanchat/base:build as build
WORKDIR /build
COPY package.json yarn.lock .yarnclean ./
RUN yarn install --production \
  --network-concurrency 20 \
  --no-node-version-check \
  --prefer-offline \
  --ignore-platform \
  && yarn cache clean

COPY . .
RUN yarn run build \
  && rm -rf node_modules/typescript

# 运行时
# FROM registry.cn-shenzhen.aliyuncs.com/cyanchat/alinode:runtime
FROM node:12-alpine
EXPOSE 3000
EXPOSE 50000
ENV APP_HOME=/home/deployment/app \
  NODE_ENV=production \
  PORT=3000 \
  DEBUG=engine,socket.io*

WORKDIR $APP_HOME
COPY --from=build /build/package.json /build/yarn.lock ./
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/dist ./dist
CMD [ "yarn", "start:prod" ]
