import javaBasic from'./java-basic.mjs'
import collections from'./collections.mjs'
import concurrency from'./concurrency.mjs'
import jvm from'./jvm.mjs'
import mysql from'./mysql.mjs'
import redis from'./redis.mjs'
import clickhouse from'./clickhouse.mjs'
import kafka from'./kafka.mjs'
import elasticsearch from'./elasticsearch.mjs'
import architecture from'./architecture.mjs'

export const practiceFollowUpOverrides={
  ...javaBasic,
  ...collections,
  ...concurrency,
  ...jvm,
  ...mysql,
  ...redis,
  ...clickhouse,
  ...kafka,
  ...elasticsearch,
  ...architecture
}
