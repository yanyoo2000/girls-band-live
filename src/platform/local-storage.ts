/**
 * localStorage 存档适配器（tech-spec §8；集成层，tech-director 所有）。
 *
 * - 只包装 `StorageLike`，所有异常都静默降级（隐私模式 / 配额满 / 禁用存储）；
 * - 解析与合并逻辑在 `src/game/save.ts`（纯函数），本文件不重复业务规则；
 * - 损坏内容备份到 `gbl.save.v1.bad`，不阻塞启动。
 */
import { parseSave, serializeSave } from '../game/save';
import type { SaveDataV1, SaveLoadResult, SavePort, StorageLike } from '../types/save';

export const SAVE_KEY = 'gbl.save.v1';
export const SAVE_BACKUP_KEY = 'gbl.save.v1.bad';

/** 创建存档端口；`storage` 为 null（不可用）时全部退化为内存默认值。 */
export function createLocalStorageSavePort(storage: StorageLike | null): SavePort {
  const readRaw = (): string | null => {
    if (storage === null) return null;
    try {
      return storage.getItem(SAVE_KEY);
    } catch {
      return null;
    }
  };

  const backup = (raw: string): void => {
    if (storage === null) return;
    try {
      storage.setItem(SAVE_BACKUP_KEY, raw);
    } catch {
      // 备份失败不影响主流程。
    }
  };

  return {
    load(): SaveLoadResult {
      const raw = readRaw();
      const result = parseSave(raw);
      if (result.status === 'recovered' && raw !== null) {
        backup(raw);
      }
      return result;
    },

    save(data: SaveDataV1, _reason): boolean {
      if (storage === null) return false;
      try {
        storage.setItem(SAVE_KEY, serializeSave(data));
        return true;
      } catch {
        return false;
      }
    },

    backupCorrupted(raw: string): void {
      backup(raw);
    },

    clear(): void {
      if (storage === null) return;
      try {
        storage.removeItem(SAVE_KEY);
      } catch {
        // 忽略：清空失败不影响本局。
      }
    },
  };
}
