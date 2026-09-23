// 화면을 확인할 때만 사용하는 개발 도구 설정이에요. 배포 앱에는 서버가 필요 없어요.
import { createAppDocument, sourceFiles } from './build.mjs';

export default {
  server: { host: '0.0.0.0', allowedHosts: ['terminal.local'] },
  plugins: [{
    name: 'researchtalk-complete-page',
    transformIndexHtml: { order: 'pre', handler: () => createAppDocument() },
    handleHotUpdate({ file, server }) {
      if (sourceFiles.includes(file)) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    }
  }]
};
