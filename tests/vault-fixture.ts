// 시험용 가상 실제 볼트(임시 폴더): 라우터 · 장부 · 안내 문서 · src-* 심볼릭 링크 · 별칭 · 비공개 · 비밀 · 이탈 링크.
// 이름은 모두 합성이다. PRIVATE_WORDS는 어떤 API 응답 · 로그에도 나오면 안 되는 낱말이다.
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const PRIVATE_WORDS = ['연봉협상메모', '숨', '비밀금고', 'legacy-diary', 'hidden-plan.md', 'api_token.txt', '실경로비공개'];

export function makeFixture(base = mkdtempSync(path.join(tmpdir(), 'sbv-fx-'))) {
  const vault = path.join(base, 'vault'), extA = path.join(base, 'drive-a'), extOut = path.join(base, 'outside');
  const w = (file: string, text: string) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); };
  // 외부 원문(드라이브 흉내)
  w(path.join(extA, 'projects/nova/brief.md'), '# 노바 기획서\n\n원문 본문 예시. 경로 /Users/someone/secret/x.md 는 가린다.\n');
  w(path.join(extA, 'projects/nova/board.png'), 'png');
  w(path.join(extA, 'projects/nova/회의 메모.md'.normalize('NFD')), '# 회의 메모\n');
  w(path.join(extA, 'projects/nova/slides.key'), 'keynote');
  w(path.join(extA, 'projects/nova/api_token.txt'), 'TOKEN=should-never-be-read');
  w(path.join(extA, '실경로비공개/plan.md'), '# 비공개 실경로 원문\n');
  w(path.join(extA, 'big.md'), '#'.repeat(600 * 1024));
  writeFileSync(path.join(extA, 'binary.md'), Buffer.from([0xff, 0xfe, 0x00]));
  w(path.join(extOut, 'escaped.md'), '# 루트 밖 원문\n');
  mkdirSync(path.join(extA, 'projects/archive'), { recursive: true });
  symlinkSync(extOut, path.join(extA, 'escape-link'));
  // 볼트
  mkdirSync(vault, { recursive: true });
  symlinkSync(extA, path.join(vault, 'src-work'));
  symlinkSync(extA, path.join(vault, 'src-alias'));          // 같은 실제 폴더의 두 번째 별칭
  symlinkSync(path.join(base, 'missing-drive'), path.join(vault, 'src-offline')); // 닿지 않는 루트
  w(path.join(vault, '.secondbrain/private-paths.txt'), '# 장부\nsrc-alias/실경로비공개\nsrc-work/projects/nova/hidden-plan.md\n');
  w(path.join(vault, 'CLAUDE.md'), [
    '# 라우터',
    '- 비공개: `legacy-diary` · `src-work/연봉협상메모` · `src-work/숨` · `비밀금고`',
    '- 비공개 장부: .secondbrain/private-paths.txt',
    '## 영역', '- [업무](work.md) — 업무 색인', '- [개인](personal.md)',
    '## 주제', '- [기획](moc-기획.md)', '- [이탈 안내](moc-이탈.md)',
    '## 프로젝트', '- [노바](project-nova.md)',
    '## 외부 자료 폴더', '| 링크 | 원본 위치 | 영역 |', '| --- | --- | --- |',
    '| [src-work](src-work) | /Users/someone/Library/CloudStorage/Drive-A | 업무 |',
    '| [src-alias](src-alias) | /Volumes/Ext/alias | 업무 |',
    '| [src-offline](src-offline) | D:\\drive\\offline | 개인 |',
    '비공개 안내: 이 줄은 지운다 legacy-diary'
  ].join('\n'));
  w(path.join(vault, 'work.md'), [
    '# 업무', '- [업무 · 프로젝트](work--projects.md)',
    '- [노바 기획서](src-work/projects/nova/brief.md) — 개편 범위와 기준',
    '- [같은 기획서(별칭)](src-alias/projects/nova/brief.md) — 별칭 링크',
    '- [보드](src-work/projects/nova/board.png) — 이미지 · 숨 참고',
    '- [슬라이드](src-work/projects/nova/slides.key) — 발표 파일',
    '- [토큰](src-work/projects/nova/api_token.txt)',
    '- [별칭 우회](src-work/실경로비공개/plan.md) — 공개 별칭으로 비공개 실경로 접근 시도',
    '- [숨은 계획](src-work/projects/nova/hidden-plan.md)',
    '- [이탈](src-work/escape-link/escaped.md) — 루트 밖',
    '- [보관함](src-work/projects/archive/) — 폴더 링크',
    '- [큰 파일](src-work/big.md)', '- [깨진 글자](src-work/binary.md)',
    '- [오프라인](src-offline/a.md) — 끊긴 드라이브',
    '- [없는 파일](src-work/gone.md)',
    '- [바깥 프로젝트](../outside/escaped.md) — 볼트 밖 상대 링크(주소는 보내지 않음)',
    '- [에이전트 지침](AGENTS.md) — 의도적으로 연결하지 않는 최상위 문서',
    '`[코드 안](src-work/code.md)` 비밀금고 언급은 지운다'
  ].join('\n'));
  w(path.join(vault, 'work--projects.md'), '# 업무 · 프로젝트\n- [노바](project-nova.md)\n- [회의 메모](src-work/projects/nova/%ED%9A%8C%EC%9D%98%20%EB%A9%94%EB%AA%A8.md)\n');
  w(path.join(vault, 'personal.md'), '# 개인\n- [비밀 일기](legacy-diary/a.md)\n- [연봉](src-work/연봉협상메모/a.md)\n');
  w(path.join(vault, 'moc-기획.md'), '# 기획\n- [노바 기획서](src-work/projects/nova/brief.md#범위)\n');
  w(path.join(vault, 'project-nova.md'), '# 노바 안내\n- [기획서](src-alias/projects/nova/brief.md)\n- [회의 메모](<src-work/projects/nova/회의 메모.md>)\n');
  w(path.join(vault, 'AGENTS.md'), '# 지침\n');
  // 안내 문서처럼 보이지만 볼트 밖 원문을 가리키는 심볼릭 링크(읽으면 안 됨)
  w(path.join(extOut, 'leak.md'), '# 볼트 밖 문서\n실경로비공개 본문\n');
  symlinkSync(path.join(extOut, 'leak.md'), path.join(vault, 'moc-이탈.md'));
  return { base, vault, extA, extOut };
}
