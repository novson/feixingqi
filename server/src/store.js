import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** 读取 JSON 文件，不存在或损坏时返回兜底值。 */
export async function readJson(file, fallback) {
  try {
    const raw = await readFile(file, 'utf8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

/** 原子写入：先写 .tmp 再 rename，避免进程被杀时留下半个文件。 */
export async function writeJsonAtomic(file, value) {
  const target = String(file)
  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.tmp`
  await writeFile(temporary, JSON.stringify(value, null, 2), 'utf8')
  try {
    await rename(temporary, target)
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error
    await writeFile(target, JSON.stringify(value, null, 2), 'utf8')
  }
  return value
}
