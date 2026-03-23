import { Sequelize } from 'sequelize';
import config from '../config/index';
import { join } from 'path';

const databaseUrl = process.env.DATABASE_URL;

export const sequelize = databaseUrl
  ? new Sequelize(databaseUrl, {
      dialect: 'postgres',
      logging: false,
      dialectOptions: {
        ssl: {
          rejectUnauthorized: false,
        },
      },
      pool: {
        max: 5,
        min: 0,
        idle: 30000,
        acquire: 30000,
        evict: 10000,
      },
    })
  : new Sequelize({
      dialect: 'sqlite',
      storage: join(config.dbPath, 'database.sqlite'),
      logging: false,
      retry: {
        max: 10,
        match: ['SQLITE_BUSY: database is locked'],
      },
      pool: {
        max: 5,
        min: 2,
        idle: 30000,
        acquire: 30000,
        evict: 10000,
      },
    });

export type ResponseType<T> = { code: number; data?: T; message?: string };
