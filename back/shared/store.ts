import { AuthInfo } from '../data/system';
import { App } from '../data/open';
import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';
import KeyvPostgres from '@keyv/postgres';
import config from '../config';
import path from 'path';

export enum EKeyv {
  'apps' = 'apps',
  'authInfo' = 'authInfo',
}

export interface IKeyvStore {
  apps: App[];
  authInfo: AuthInfo;
}

const databaseUrl = process.env.DATABASE_URL;
const keyvStoreBackend = databaseUrl
  ? new KeyvPostgres(databaseUrl, {
      table: 'keyv_store',
    })
  : new KeyvSqlite(path.join(config.dbPath, 'keyv.sqlite'));

export const keyvStore = new Keyv({ store: keyvStoreBackend });

export const shareStore = {
  getAuthInfo() {
    return keyvStore.get(EKeyv.authInfo) as Promise<IKeyvStore['authInfo']>;
  },
  updateAuthInfo(value: IKeyvStore['authInfo']) {
    return keyvStore.set(EKeyv.authInfo, value);
  },
  getApps() {
    return keyvStore.get(EKeyv.apps) as Promise<IKeyvStore['apps']>;
  },
  updateApps(apps: App[]) {
    return keyvStore.set(EKeyv.apps, apps);
  },
};
