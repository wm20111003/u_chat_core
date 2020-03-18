import { QueryFailedError } from 'typeorm';
import { Code } from './code';
function errorFilter(err: Error): Code | string {
  console.error(err);
  if (err instanceof QueryFailedError) {
    if (err.message.match(/exceeds maximum \d+ for index/i)) {
      return Code.COMMON_DB_VALUE_TOO_LONG;
    }
    return Code.COMMON_DB_ERROR;
  } else {
    return err.message;
  }
}

export { Code, errorFilter };
