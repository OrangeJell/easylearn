---
title: Elasticsearch 倒排索引原理是什么？
category: ES
categorySlug: elasticsearch
categoryOrder: 8
order: 1
description: 从分词、词项字典和文档列表理解全文检索
updated: 2026-07-23
minutes: 3
level: 进阶
---

# Elasticsearch 倒排索引原理是什么？

## 先说结论

> 倒排索引建立“词项到文档”的映射。查询时先找到词项，再读取包含该词项的文档列表，因此适合全文搜索，而不需要逐条扫描原始文本。

## 分析过程

文本字段写入时经过 analyzer：字符过滤器预处理文本，tokenizer 切分词元，token filter 再进行小写化、停用词处理或词干化。查询使用的分析器应与索引设计相匹配。

## text 与 keyword

`text` 字段会分词，适合全文搜索；`keyword` 保留完整值，适合精确过滤、排序和聚合。常见 mapping 会为一个字段同时配置 text 和 keyword 子字段。

```json
{
  "title": {
    "type": "text",
    "fields": { "keyword": { "type": "keyword" } }
  }
}
```

## 分片与副本

索引由主分片组成，副本提供高可用和额外读取能力。主分片数量创建后不容易直接改变，过多小分片会增加集群元数据、文件句柄和合并压力。

## near real-time

新写入的数据经过 refresh 后才对搜索可见，所以 Elasticsearch 是近实时搜索。频繁 refresh 会增加段创建和合并成本，应根据业务延迟要求设置。

## 参考资料

- [Elastic Docs: Inverted Index](https://www.elastic.co/docs/manage-data/data-store/index-basics)

## 写入为什么是近实时

文档写入内存缓冲后，经过 Refresh 生成可搜索的新 Segment，因此写成功与搜索可见之间有短暂间隔。Flush 主要涉及持久化提交点，Merge 负责合并小 Segment，三者不能混为一谈。

## 常见问题

### 追问 1：term 为什么可能查不到 text 原文？

`text` 已被分析成多个词项，而 `term` 不分析输入。全文搜索使用 `match`，精确匹配使用 `keyword + term`。

### 追问 2：Refresh 越频繁越好吗？

不是。频繁 Refresh 降低可见延迟，但会产生更多小 Segment，增加合并与资源开销。

### 追问 3：删除后磁盘会立刻释放吗？

通常不会。不可变 Segment 先记录删除标记，实际空间在后续 Merge 重写文件时回收。
