import { Composition } from 'remotion';
import { SimDemo } from './SimDemo';
import { LibraryDemo } from './LibraryDemo';
import { BranchesDemo } from './BranchesDemo';

const FPS = 30;

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="SimDemo"
        component={SimDemo}
        durationInFrames={FPS * 8}
        fps={FPS}
        width={1280}
        height={720}
      />
      <Composition
        id="LibraryDemo"
        component={LibraryDemo}
        durationInFrames={FPS * 7}
        fps={FPS}
        width={1280}
        height={720}
      />
      <Composition
        id="BranchesDemo"
        component={BranchesDemo}
        durationInFrames={FPS * 7}
        fps={FPS}
        width={1280}
        height={720}
      />
    </>
  );
};
