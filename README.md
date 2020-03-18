# Gateway for chat backend

# 环境

### 运行时

- postgresql:
  - `brew install postgresql`,
  - `brew services start postgresql`
- redis:
  - `brew install redis`
  - `brew services start redis`

### 工具

1. vscode
   - Prettier
   - vscode-proto3
2. yarn (not npm)
3. `brew install clang-format`: proto 文件自动格式化工具
4. [socket-io-tester](https://electronjs.org/apps/socket-io-tester)

# db schema

https://dbdiagram.io/d/5cf77a8f0b930d7eb42e4139

# API doc

https://gitlab.baifu-tech.net/chat/gateway/wikis/home

## Running the app

```bash
# 创建配置文件, 并修改成直接的配置
cp .example.env .env

# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Test

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## Debug

https://socket.io/docs/logging-and-debugging/
