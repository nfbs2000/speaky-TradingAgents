// Populate the sidebar
//
// This is a script, and not included directly in the page, to control the total size of the book.
// The TOC contains an entry for each page, so if each page includes a copy of the TOC,
// the total size of the page becomes O(n**2).
class MDBookSidebarScrollbox extends HTMLElement {
    constructor() {
        super();
    }
    connectedCallback() {
        this.innerHTML = '<ol class="chapter"><li class="chapter-item expanded "><a href="preface.html"><strong aria-hidden="true">1.</strong> 이 책을 읽는 법</a></li><li class="chapter-item expanded affix "><li class="part-title">제1부: 조직을 코드로 읽기</li><li class="chapter-item expanded "><a href="part1/ch01-overview.html"><strong aria-hidden="true">2.</strong> 1장: TradingAgents는 무엇인가</a></li><li class="chapter-item expanded "><a href="part1/ch02-run-path.html"><strong aria-hidden="true">3.</strong> 2장: 한 번의 분석이 지나가는 길</a></li><li class="chapter-item expanded "><a href="part1/ch03-state-graph.html"><strong aria-hidden="true">4.</strong> 3장: 상태와 LangGraph</a></li><li class="chapter-item expanded affix "><li class="part-title">제2부: 판단을 분업하기</li><li class="chapter-item expanded "><a href="part2/ch04-analysts.html"><strong aria-hidden="true">5.</strong> 4장: 네 분석가와 도구</a></li><li class="chapter-item expanded "><a href="part2/ch05-research-debate.html"><strong aria-hidden="true">6.</strong> 5장: 강세·약세 토론과 리서치 매니저</a></li><li class="chapter-item expanded "><a href="part2/ch06-risk-decision.html"><strong aria-hidden="true">7.</strong> 6장: 트레이더·리스크 팀·포트폴리오 매니저</a></li><li class="chapter-item expanded affix "><li class="part-title">제3부: 판단의 바닥</li><li class="chapter-item expanded "><a href="part3/ch07-data-grounding.html"><strong aria-hidden="true">8.</strong> 7장: 데이터 공급자와 근거</a></li><li class="chapter-item expanded "><a href="part3/ch08-models.html"><strong aria-hidden="true">9.</strong> 8장: 모델 공급자와 구조화 출력</a></li><li class="chapter-item expanded affix "><li class="part-title">제4부: 실행을 남기기</li><li class="chapter-item expanded "><a href="part4/ch09-memory-resume.html"><strong aria-hidden="true">10.</strong> 9장: 기억, 반성, 체크포인트 재개</a></li><li class="chapter-item expanded "><a href="part4/ch10-interfaces.html"><strong aria-hidden="true">11.</strong> 10장: CLI, 패키지 API, 보고서</a></li><li class="chapter-item expanded affix "><li class="part-title">제5부: 정직하게 사용하기</li><li class="chapter-item expanded "><a href="part5/ch11-boundaries.html"><strong aria-hidden="true">12.</strong> 11장: 무엇을 증명하고 무엇을 증명하지 못하는가</a></li><li class="chapter-item expanded "><a href="source-map.html"><strong aria-hidden="true">13.</strong> 소스 지도와 출처</a></li></ol>';
        // Set the current, active page, and reveal it if it's hidden
        let current_page = document.location.href.toString().split("#")[0].split("?")[0];
        if (current_page.endsWith("/")) {
            current_page += "index.html";
        }
        var links = Array.prototype.slice.call(this.querySelectorAll("a"));
        var l = links.length;
        for (var i = 0; i < l; ++i) {
            var link = links[i];
            var href = link.getAttribute("href");
            if (href && !href.startsWith("#") && !/^(?:[a-z+]+:)?\/\//.test(href)) {
                link.href = path_to_root + href;
            }
            // The "index" page is supposed to alias the first chapter in the book.
            if (link.href === current_page || (i === 0 && path_to_root === "" && current_page.endsWith("/index.html"))) {
                link.classList.add("active");
                var parent = link.parentElement;
                if (parent && parent.classList.contains("chapter-item")) {
                    parent.classList.add("expanded");
                }
                while (parent) {
                    if (parent.tagName === "LI" && parent.previousElementSibling) {
                        if (parent.previousElementSibling.classList.contains("chapter-item")) {
                            parent.previousElementSibling.classList.add("expanded");
                        }
                    }
                    parent = parent.parentElement;
                }
            }
        }
        // Track and set sidebar scroll position
        this.addEventListener('click', function(e) {
            if (e.target.tagName === 'A') {
                sessionStorage.setItem('sidebar-scroll', this.scrollTop);
            }
        }, { passive: true });
        var sidebarScrollTop = sessionStorage.getItem('sidebar-scroll');
        sessionStorage.removeItem('sidebar-scroll');
        if (sidebarScrollTop) {
            // preserve sidebar scroll position when navigating via links within sidebar
            this.scrollTop = sidebarScrollTop;
        } else {
            // scroll sidebar to current active section when navigating via "next/previous chapter" buttons
            var activeSection = document.querySelector('#sidebar .active');
            if (activeSection) {
                activeSection.scrollIntoView({ block: 'center' });
            }
        }
        // Toggle buttons
        var sidebarAnchorToggles = document.querySelectorAll('#sidebar a.toggle');
        function toggleSection(ev) {
            ev.currentTarget.parentElement.classList.toggle('expanded');
        }
        Array.from(sidebarAnchorToggles).forEach(function (el) {
            el.addEventListener('click', toggleSection);
        });
    }
}
window.customElements.define("mdbook-sidebar-scrollbox", MDBookSidebarScrollbox);
