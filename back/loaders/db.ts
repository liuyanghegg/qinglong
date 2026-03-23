import Logger from './logger';
import { EnvModel } from '../data/env';
import { CrontabModel } from '../data/cron';
import { DependenceModel } from '../data/dependence';
import { AppModel } from '../data/open';
import { SystemModel } from '../data/system';
import { SubscriptionModel } from '../data/subscription';
import { CrontabViewModel } from '../data/cronView';
import { sequelize } from '../data';
import { DataTypes } from 'sequelize';

export default async () => {
  try {
    await CrontabModel.sync();
    await DependenceModel.sync();
    await AppModel.sync();
    await SystemModel.sync();
    await EnvModel.sync();
    await SubscriptionModel.sync();
    await CrontabViewModel.sync();

    const queryInterface = sequelize.getQueryInterface();

    // 初始化新增字段
    const migrations = [
      {
        table: 'CrontabViews',
        column: 'filterRelation',
        type: DataTypes.STRING,
      },
      { table: 'Subscriptions', column: 'proxy', type: DataTypes.STRING },
      { table: 'CrontabViews', column: 'type', type: DataTypes.INTEGER },
      {
        table: 'Subscriptions',
        column: 'autoAddCron',
        type: DataTypes.INTEGER,
      },
      {
        table: 'Subscriptions',
        column: 'autoDelCron',
        type: DataTypes.INTEGER,
      },
      { table: 'Crontabs', column: 'sub_id', type: DataTypes.INTEGER },
      { table: 'Crontabs', column: 'extra_schedules', type: DataTypes.JSON },
      { table: 'Crontabs', column: 'task_before', type: DataTypes.TEXT },
      { table: 'Crontabs', column: 'task_after', type: DataTypes.TEXT },
      { table: 'Crontabs', column: 'log_name', type: DataTypes.STRING },
      {
        table: 'Crontabs',
        column: 'allow_multiple_instances',
        type: DataTypes.INTEGER,
      },
      { table: 'Envs', column: 'isPinned', type: DataTypes.INTEGER },
    ];

    for (const migration of migrations) {
      try {
        const table = await queryInterface.describeTable(migration.table);

        if (!table[migration.column]) {
          await queryInterface.addColumn(migration.table, migration.column, {
            type: migration.type,
            allowNull: true,
          });
        }
      } catch (error) {
        // Column already exists or other error, continue
      }
    }

    Logger.info('✌️ DB loaded');
  } catch (error) {
    Logger.error('✌️ DB load failed', error);
  }
};
