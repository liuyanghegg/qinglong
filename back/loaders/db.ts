import Logger from './logger';
import { EnvModel } from '../data/env';
import { CrontabModel } from '../data/cron';
import { DependenceModel } from '../data/dependence';
import { AppModel } from '../data/open';
import { SystemModel } from '../data/system';
import { SubscriptionModel } from '../data/subscription';
import { CrontabViewModel } from '../data/cronView';
import { sequelize } from '../data';

export default async () => {
  try {
    await sequelize.authenticate();
    await CrontabModel.sync();
    await DependenceModel.sync();
    await AppModel.sync();
    await SystemModel.sync();
    await EnvModel.sync();
    await SubscriptionModel.sync();
    await CrontabViewModel.sync();

    const numberType = sequelize.getDialect() === 'postgres' ? 'INTEGER' : 'NUMBER';
    const jsonType = sequelize.getDialect() === 'postgres' ? 'JSONB' : 'JSON';

    // 初始化新增字段
    const migrations = [
      {
        table: 'CrontabViews',
        column: 'filterRelation',
        type: 'VARCHAR(255)',
      },
      { table: 'Subscriptions', column: 'proxy', type: 'VARCHAR(255)' },
      { table: 'CrontabViews', column: 'type', type: numberType },
      { table: 'Subscriptions', column: 'autoAddCron', type: numberType },
      { table: 'Subscriptions', column: 'autoDelCron', type: numberType },
      { table: 'Crontabs', column: 'sub_id', type: numberType },
      { table: 'Crontabs', column: 'extra_schedules', type: jsonType },
      { table: 'Crontabs', column: 'task_before', type: 'TEXT' },
      { table: 'Crontabs', column: 'task_after', type: 'TEXT' },
      { table: 'Crontabs', column: 'log_name', type: 'VARCHAR(255)' },
      {
        table: 'Crontabs',
        column: 'allow_multiple_instances',
        type: numberType,
      },
      { table: 'Envs', column: 'isPinned', type: numberType },
    ];

    for (const migration of migrations) {
      try {
        await sequelize.query(
          `alter table ${migration.table} add column ${migration.column} ${migration.type}`,
        );
      } catch (error) {
        // Column already exists or other error, continue
      }
    }

    Logger.info('✌️ DB loaded');
  } catch (error) {
    Logger.error('✌️ DB load failed', error);
  }
};
