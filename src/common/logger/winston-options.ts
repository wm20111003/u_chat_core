import { format, transports, LoggerOptions } from 'winston';

const { combine, timestamp, label, printf } = format;

const myFormat = printf(
  ({ level, message, label: _label, timestamp: _timestamp }) => {
    return `${_timestamp} [${_label}] ${level}: ${message}`;
  },
);

export const WinstonOptions: LoggerOptions = {
  level: 'info',
  format: combine(label({ label: 'gateway' }), timestamp(), myFormat),
  transports: [
    new transports.Console({
      format: myFormat,
    }),
    new transports.File({
      filename: `${process.cwd()}/logs/error.log`,
      level: 'error',
    }),
    new transports.File({
      filename: `${process.cwd()}/logs/combined.log`,
    }),
  ],
};
