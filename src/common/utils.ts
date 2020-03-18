import generate = require('nanoid/generate');
import * as Sentry from '@sentry/minimal';
import * as pinyin from 'pinyin';
import { Severity } from '@sentry/types';
import * as i18n from 'i18n';
import { hostname } from 'os';

// remove 'lIO0' for human
export const uid = (length = 10) =>
  generate(
    '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
    length,
  );

export const getStringLengthForChinese = str =>
  [...str].reduce((sum, _, i) => sum + (str.charCodeAt(i) < 256 ? 1 : 2), 0);

export const getPinyin = char => {
  if (!char) return char;
  return pinyin(char, {
    style: pinyin.STYLE_NORMAL,
  }).join(' ');
};

export interface SentryOptions {
  tags?: { [key: string]: string };
  extra?: { [key: string]: any };
  fingerprint?: string[];
  level?: Severity;
  context?: 'Http' | 'Ws' | 'Rpc';
}

// common sentry method
export const captureException = (
  exception,
  options: SentryOptions = { context: 'Ws' },
) => {
  Sentry.withScope(scope => {
    if (options) {
      if (options.context) scope.setTag('Protocol', options.context);
      if (options.level) scope.setLevel(options.level);
      if (options.fingerprint) scope.setFingerprint(options.fingerprint);
      if (options.extra) {
        for (const key in options.extra) {
          if (options.extra.hasOwnProperty(key)) {
            scope.setExtra(key, options.extra[key]);
          }
        }
      }
    }
    for (const tag in options.tags) {
      if (tag) scope.setTag(tag, options.tags[tag]);
    }
    scope.setTag('hostname', hostname());
    Sentry.captureException(exception);
  });
};

i18n.configure({
  locales: ['en', 'zh-CN'],
  register: {},
  directory: __dirname + '/locales',
  defaultLocale: 'zh-CN',
});
// i18n.init();
export { i18n };
