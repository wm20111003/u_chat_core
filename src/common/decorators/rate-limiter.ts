import { RateLimiterMemory, IRateLimiterOptions } from 'rate-limiter-flexible';
import { Code } from '../error/code';

interface IExtendedRateLimiterOptions extends IRateLimiterOptions {
  // 需将参数作为 prefix 时，指定参数的名称
  extractParamAsPrefix?: string;
  // 触发频率限制时，返回自定义 error code
  customErrorCode?: Code;
}

export const UseLimit = (options: IExtendedRateLimiterOptions): any => {
  const { extractParamAsPrefix, customErrorCode, ...rest } = options;
  const rateLimiter = new RateLimiterMemory(rest);

  return (_, name, descriptor) => {
    const oldValue = descriptor.value;

    descriptor.value = async function() {
      try {
        const [socket, params] = arguments;
        // 如果有登录用户，则按照用户 ID 限制频率，否则根据 IP 限制频率
        const suffix = socket.user?.id || socket.handshake.address;
        const prefix = extractParamAsPrefix
          ? params[extractParamAsPrefix]
          : null;
        const key = prefix
          ? `${prefix}-${name}-${suffix}`
          : `${name}-${suffix}`;
        await rateLimiter.consume(key, 1);
        return oldValue.apply(this, arguments);
      } catch (error) {
        if (error.remainingPoints === 0) {
          return {
            status: 'failed',
            code: customErrorCode || Code.COMMON_RATE_LIMIT_EXCEEDED,
            action: name,
          };
        }
        throw error;
      }
    };

    return descriptor;
  };
};
