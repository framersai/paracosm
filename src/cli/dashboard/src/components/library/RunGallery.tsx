import * as React from 'react';
import styles from './RunGallery.module.scss';
import { RunCard } from './RunCard.js';
import type { RunRecord } from '../../../../server/run-record.js';

export interface RunGalleryProps {
  runs: RunRecord[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  onOpen: (runId: string) => void;
  onReplay: (runId: string) => void;
  onPageChange: (offset: number) => void;
  currentOffset: number;
  pageSize: number;
}

export function RunGallery(props: RunGalleryProps): JSX.Element {
  const { runs, total, hasMore, loading, onOpen, onReplay, onPageChange, currentOffset, pageSize } = props;
  const page = Math.floor(currentOffset / pageSize) + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className={styles.gallery}>
      <header className={styles.head}>
        <span>All runs · {loading ? 'loading…' : `${total} results`}</span>
      </header>

      {loading && runs.length === 0 ? (
        <div className={styles.skeletonGrid}>
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className={styles.cardSkeleton} />)}
        </div>
      ) : (
        <div className={styles.grid}>
          {runs.map(r => (
            <RunCard
              key={r.runId}
              record={r}
              onOpen={() => onOpen(r.runId)}
              onReplay={() => onReplay(r.runId)}
            />
          ))}
        </div>
      )}

      <footer className={styles.foot}>
        <button
          disabled={currentOffset === 0}
          onClick={() => onPageChange(Math.max(0, currentOffset - pageSize))}
        >‹ Prev</button>
        <span>page {page} of {totalPages}</span>
        <button disabled={!hasMore} onClick={() => onPageChange(currentOffset + pageSize)}>Next ›</button>
      </footer>
    </section>
  );
}
