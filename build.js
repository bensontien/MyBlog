const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { marked } = require('marked');

// Configure marked options
marked.setOptions({
  headerIds: false,
  mangle: false
});

// Helper: Copy directory recursively
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Helper: Format date (YYYY-MM-DD)
function formatDate(dateObj) {
  const d = new Date(dateObj);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper: Word count
function countWords(str) {
  // Strip HTML tags
  const text = str.replace(/<[^>]*>/g, '');
  // Match Chinese characters and English words
  const cn = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const en = (text.match(/[a-zA-Z0-9_-]+/g) || []).length;
  const count = cn + en;
  if (count > 1000) {
    return (count / 1000).toFixed(1) + 'k';
  }
  return count;
}

// Helper: Truncate text for summary
function getSummary(html, length = 150) {
  // Remove script and style tags
  let text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Remove HTML tags
  text = text.replace(/<[^>]*>/g, '');
  // Unescape entities
  text = text.replace(/&nbsp;/g, ' ')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&amp;/g, '&')
             .replace(/&quot;/g, '"');
  text = text.replace(/\s+/g, ' ').strip || text.trim();
  if (text.length > length) {
    return text.substring(0, length) + '...';
  }
  return text;
}

// Helper: URL encoding matching Hexo's style
function encodeCategoryOrTag(name) {
  return encodeURIComponent(name);
}

// Main builder function
function build() {
  console.log('Starting blog build...');

  const postsDir = path.join(__dirname, 'source', '_posts');
  const templatesDir = path.join(__dirname, 'templates');
  const staticDir = path.join(__dirname, 'static');
  const publicDir = path.join(__dirname, 'public');

  // Load templates
  const baseTpl = fs.readFileSync(path.join(templatesDir, 'base.html'), 'utf8');
  const postTpl = fs.readFileSync(path.join(templatesDir, 'post.html'), 'utf8');
  const pageTpl = fs.readFileSync(path.join(templatesDir, 'page.html'), 'utf8');
  const indexTpl = fs.readFileSync(path.join(templatesDir, 'index.html'), 'utf8');
  const archiveTpl = fs.readFileSync(path.join(templatesDir, 'archive.html'), 'utf8');

  // Recreate public directory
  if (fs.existsSync(publicDir)) {
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
  fs.mkdirSync(publicDir);

  // Copy static assets
  if (fs.existsSync(staticDir)) {
    copyDir(staticDir, publicDir);
    console.log('Copied static assets.');
  }

  // Load all posts
  const posts = [];
  if (fs.existsSync(postsDir)) {
    const files = fs.readdirSync(postsDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(postsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Parse Front-Matter
        const fmMatch = content.match(/^---([\s\S]*?)---\n([\s\S]*)$/);
        if (fmMatch) {
          const meta = yaml.load(fmMatch[1]);
          const bodyMd = fmMatch[2];
          const bodyHtml = marked.parse(bodyMd);
          
          posts.push({
            id: meta.id || path.basename(file, '.md'),
            title: meta.title,
            date: new Date(meta.date),
            categories: meta.categories || [],
            tags: meta.tags || [],
            bodyHtml,
            summary: getSummary(bodyHtml, 200),
            wordCount: countWords(bodyHtml)
          });
        }
      }
    }
  }

  // Sort posts by date descending
  posts.sort((a, b) => b.date - a.date);
  console.log(`Loaded ${posts.length} posts.`);

  // Build taxonomy indexes
  const categoriesMap = new Map(); // Category path (e.g. "百合", "百合/少女歌劇") -> Array of posts
  const tagsMap = new Map();       // Tag -> Array of posts
  const archivesMap = new Map();   // "YYYY/MM" -> Array of posts

  // Helper to register category hierarchy
  function registerCategory(catList, post) {
    if (!catList || catList.length === 0) return;
    
    // Hexo supports hierarchical categories
    // For [A, B], A is a category, B is its subcategory
    // Register A
    const pathA = catList[0];
    if (!categoriesMap.has(pathA)) categoriesMap.set(pathA, []);
    categoriesMap.get(pathA).push(post);
    
    // Register A/B
    if (catList.length > 1) {
      const pathAB = catList.slice(0, 2).join('/');
      if (!categoriesMap.has(pathAB)) categoriesMap.set(pathAB, []);
      categoriesMap.get(pathAB).push(post);
    }
  }

  for (const post of posts) {
    // Categories
    registerCategory(post.categories, post);

    // Tags
    for (const tag of post.tags) {
      if (!tagsMap.has(tag)) tagsMap.set(tag, []);
      tagsMap.get(tag).push(post);
    }

    // Archives
    const year = post.date.getFullYear();
    const month = String(post.date.getMonth() + 1).padStart(2, '0');
    const archiveKey = `${year}/${month}`;
    if (!archivesMap.has(archiveKey)) archivesMap.set(archiveKey, []);
    archivesMap.get(archiveKey).push(post);
  }

  // Generate sidebar HTML components
  const infoCard = `
  <div class="widget-wrap">
    <div class="info-card">
      <div class="avatar">
        <image src="/MyBlog/images/avatar2026.png"></image>
        <div class="img-dim"></div>
      </div>
      <div class="info">
        <div class="username">Tsubame </div>
        <div class="dot"></div>
        <div class="subtitle">在科技業寫術式的魔法師，偶爾兼職畫點插圖，寫寫雜談、影評、技術文章，宣揚百合文化 </div>
        <div class="link-list">
          <a class="link-btn" target="_blank" rel="noopener external nofollow noreferrer" href="https://x.com/tsubame0405" title="Twitter"><i class="fa-brands fa-twitter"></i></a>
          <a class="link-btn" target="_blank" rel="noopener external nofollow noreferrer" href="https://www.pixiv.net/users/7449941" title="Pixiv"><i class="fa-brands fa-p"></i></a>
          <a class="link-btn" target="_blank" rel="noopener external nofollow noreferrer" href="https://github.com/bensontien" title="GitHub"><i class="fa-brands fa-github"></i></a>
        </div>  
      </div>
    </div>
  </div>`;

  // Categories Widget HTML
  let categoriesHtml = '<div class="widget-wrap"><div class="widget"><h3 class="widget-title">分類</h3><div class="category-box">';
  
  // Sort categories alphabetically
  const rootCategories = Array.from(categoriesMap.keys()).filter(c => !c.includes('/'));
  rootCategories.sort();
  
  for (const rootCat of rootCategories) {
    const rootCount = categoriesMap.get(rootCat).length;
    const rootUrl = `/MyBlog/categories/${encodeCategoryOrTag(rootCat)}/`;
    categoriesHtml += `
    <a class="category-link" href="${rootUrl}">
      ${rootCat}
      <div class="category-count">${rootCount}</div>
    </a>`;
    
    // Subcategories
    const subCats = Array.from(categoriesMap.keys()).filter(c => c.startsWith(rootCat + '/'));
    if (subCats.length > 0) {
      categoriesHtml += '<div class="children"><div class="category-box">';
      for (const subCat of subCats) {
        const subName = subCat.split('/')[1];
        const subCount = categoriesMap.get(subCat).length;
        const subUrl = `/MyBlog/categories/${rootCat}/${encodeCategoryOrTag(subName)}/`;
        categoriesHtml += `
        <a class="category-link" href="${subUrl}">
          ${subName}
          <div class="category-count">${subCount}</div>
        </a>`;
      }
      categoriesHtml += '</div></div>';
    }
  }
  categoriesHtml += '</div></div></div>';

  // Tags Widget HTML
  let tagsHtml = '<div class="widget-wrap"><div class="widget"><h3 class="widget-title">標籤</h3><ul class="article-tag-list" itemprop="keywords">';
  const sortedTags = Array.from(tagsMap.keys()).sort();
  for (const tag of sortedTags) {
    const tagUrl = `/MyBlog/tags/${encodeCategoryOrTag(tag)}/`;
    tagsHtml += `<li class="article-tag-list-item"><a class="article-tag-list-link" href="${tagUrl}" rel="tag">${tag}</a></li>`;
  }
  tagsHtml += '</ul></div></div>';

  // Archives Widget HTML
  let archivesWidgetHtml = '<div class="widget-wrap"><div class="widget"><h3 class="widget-title">彙整</h3>';
  const sortedArchiveKeys = Array.from(archivesMap.keys()).sort((a, b) => b.localeCompare(a));
  for (const key of sortedArchiveKeys) {
    const [year, month] = key.split('/');
    const count = archivesMap.get(key).length;
    const monthsCh = {
      '01': '一月', '02': '二月', '03': '三月', '04': '四月', '05': '五月', '06': '六月',
      '07': '七月', '08': '八月', '09': '九月', '10': '十月', '11': '十一月', '12': '十二月'
    };
    const name = `${monthsCh[month]} ${year}`;
    const archiveUrl = `/MyBlog/archives/${year}/${month}/`;
    archivesWidgetHtml += `
    <a class="archive-link" href="${archiveUrl}">
      ${name}
      <div class="archive-count">${count}</div>
    </a>`;
  }
  archivesWidgetHtml += '</div></div>';

  // Recent Posts Widget HTML
  let recentPostsHtml = '<div class="widget-wrap"><div class="widget"><h3 class="widget-title">最新文章</h3><ul>';
  const recentPosts = posts.slice(0, 10);
  for (const post of recentPosts) {
    recentPostsHtml += `
    <li>
      <a href="/MyBlog/posts/${post.id}/">${post.title}</a>
    </li>`;
  }
  recentPostsHtml += '</ul></div></div>';

  // Combine to create the entire sidebar
  const sidebarHtml = `
  <sidebar id="sidebar">
    ${infoCard}
    <div class="sticky">
      ${categoriesHtml}
      ${tagsHtml}
      ${archivesWidgetHtml}
      ${recentPostsHtml}
    </div>
  </sidebar>`;

  // Helper: render page with base template
  function renderPage(content, options = {}) {
    const title = options.title || 'Tsubame 圖文窩';
    const description = options.description || 'Tsubame圖文窩為分享雜談、影評、插圖、繪畫心得、程式技術文章、的個人部落格';
    const banner_class = options.isHome ? ' is_home ' : '';
    const nav_class = options.isHome ? ' is_home ' : '';
    
    // Open Graph meta tags
    const og_meta = options.ogMeta || `
    <meta property="og:type" content="website">
    <meta property="og:title" content="${title}">
    <meta property="og:url" content="https://bensontien.github.io/MyBlog/${options.path || ''}">
    <meta property="og:site_name" content="Tsubame 圖文窩">
    <meta property="og:description" content="${description}">
    <meta property="og:locale" content="zh_TW">
    <meta name="twitter:card" content="summary">`;

    return baseTpl
      .replace(/\{\{\s*title\s*\}\}/g, title)
      .replace(/\{\{\s*description\s*\}\}/g, description)
      .replace(/\{\{\s*banner_class\s*\}\}/g, banner_class)
      .replace(/\{\{\s*nav_class\s*\}\}/g, nav_class)
      .replace(/\{\{\s*og_meta\s*\}\}/g, og_meta)
      .replace(/\{\{\s*sidebar\s*\}\}/g, sidebarHtml)
      .replace(/\{\{\s*content\s*\}\}/g, content);
  }

  // Helper: Render category links string (Category1 > Category2)
  function renderCategoriesLinks(cats) {
    if (!cats || cats.length === 0) return '未分類';
    const links = [];
    let currentPath = '';
    for (let i = 0; i < cats.length; i++) {
      const cat = cats[i];
      if (i === 0) {
        currentPath = cat;
      } else {
        currentPath += '/' + cat;
      }
      // Encode URI but match hexo folders
      const url = `/MyBlog/categories/${cats.slice(0, i+1).map(encodeCategoryOrTag).join('/')}/`;
      links.push(`<a class="meta-cate-link" href="${url}">${cat}</a>`);
    }
    return links.join('>');
  }

  // Helper: Render tags list items
  function renderTagsLinks(tags) {
    if (!tags || tags.length === 0) return '';
    return tags.map(tag => {
      const url = `/MyBlog/tags/${encodeCategoryOrTag(tag)}/`;
      return `<li class="article-tag-list-item"><a class="article-tag-list-link" href="${url}" rel="tag">${tag}</a></li>`;
    }).join('');
  }

  // --- 1. COMPILE POST DETAIL PAGES ---
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const nextPost = i > 0 ? posts[i - 1] : null;
    const prevPost = i < posts.length - 1 ? posts[i + 1] : null;

    let navHtml = '<nav id="article-nav">';
    if (prevPost) {
      navHtml += `
      <a class="article-nav-btn left" href="/MyBlog/posts/${prevPost.id}/" title="${prevPost.title}">
        <i class="fa-solid fa-angle-left"></i>
        <p class="title-text">${prevPost.title}</p>
      </a>`;
    } else {
      navHtml += '<div class="article-nav-btn left disabled"></div>';
    }
    if (nextPost) {
      navHtml += `
      <a class="article-nav-btn right" href="/MyBlog/posts/${nextPost.id}/" title="${nextPost.title}">
        <p class="title-text">${nextPost.title}</p>
        <i class="fa-solid fa-angle-right"></i>
      </a>`;
    } else {
      navHtml += '<div class="article-nav-btn right disabled"></div>';
    }
    navHtml += '</nav>';

    const postContent = postTpl
      .replace(/\{\{\s*id\s*\}\}/g, post.id)
      .replace(/\{\{\s*title\s*\}\}/g, post.title)
      .replace(/\{\{\s*date_iso\s*\}\}/g, post.date.toISOString())
      .replace(/\{\{\s*date_formatted\s*\}\}/g, formatDate(post.date))
      .replace(/\{\{\s*categories\s*\}\}/g, renderCategoriesLinks(post.categories))
      .replace(/\{\{\s*tags\s*\}\}/g, renderTagsLinks(post.tags))
      .replace(/\{\{\s*word_count\s*\}\}/g, post.wordCount)
      .replace(/\{\{\s*body\s*\}\}/g, post.bodyHtml)
      .replace(/\{\{\s*nav\s*\}\}/g, navHtml);

    const ogMeta = `
    <meta property="og:type" content="article">
    <meta property="og:title" content="${post.title}">
    <meta property="og:url" content="https://bensontien.github.io/MyBlog/posts/${post.id}/">
    <meta property="og:site_name" content="Tsubame 圖文窩">
    <meta property="og:description" content="${post.summary}">
    <meta property="og:locale" content="zh_TW">
    <meta property="article:published_time" content="${post.date.toISOString()}">
    <meta property="article:author" content="Tsubame">
    ${post.tags.map(t => `<meta property="article:tag" content="${t}">`).join('\n    ')}
    <meta name="twitter:card" content="summary">`;

    const fullHtml = renderPage(postContent, {
      title: `${post.title} | Tsubame 圖文窩`,
      description: post.summary,
      ogMeta,
      path: `posts/${post.id}/`
    });

    const postOutDir = path.join(publicDir, 'posts', post.id);
    fs.mkdirSync(postOutDir, { recursive: true });
    fs.writeFileSync(path.join(postOutDir, 'index.html'), fullHtml);
    console.log(`Compiled post: ${post.id}`);
  }

  // --- 2. COMPILE INDEX & PAGINATION PAGES ---
  const postsPerPage = 10;
  const totalPages = Math.ceil(posts.length / postsPerPage);

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const startIndex = (pageNum - 1) * postsPerPage;
    const pagePosts = posts.slice(startIndex, startIndex + postsPerPage);

    let postListHtml = '';
    for (const post of pagePosts) {
      postListHtml += `
      <article id="post-${post.id}" class="h-entry article article-type-post" itemprop="blogPost" itemscope itemtype="https://schema.org/BlogPosting">
        <div class="article-inner">
          <div class="article-main">
            <header class="article-header">
              <div class="main-title-bar">
                <div class="main-title-dot"></div>
                <h1 itemprop="name">
                  <a class="p-name article-title" href="/MyBlog/posts/${post.id}/">${post.title}</a>
                </h1>
              </div>
              <div class='meta-info-bar'>
                <div class="meta-info">
                  <time class="dt-published" datetime="${post.date.toISOString()}" itemprop="datePublished">${formatDate(post.date)}</time>
                </div>
                <div class="need-seperator meta-info">
                  <div class="meta-cate-flex">
                    ${renderCategoriesLinks(post.categories)}
                  </div>
                </div>
                <div class="wordcount need-seperator meta-info">
                  ${post.wordCount} 詞
                </div>
              </div>
              <ul class="article-tag-list" itemprop="keywords">
                ${renderTagsLinks(post.tags)}
              </ul>
            </header>
            <div class="e-content article-entry" itemprop="articleBody">
              <div class="truncate-text">
                ${post.summary}
              </div>
            </div>
          </div>
          <a class="right-panel non-pic" href="/MyBlog/posts/${post.id}/">
            <i class="fa-solid fa-angle-right non-pic"></i>
          </a>
        </div>
      </article>\n`;
    }

    // Pagination HTML
    let paginationHtml = '';
    if (totalPages > 1) {
      paginationHtml += '<nav id="page-nav">';
      
      const prevUrl = pageNum === 2 ? '/MyBlog/' : `/MyBlog/page/${pageNum - 1}/`;
      const prevClass = pageNum === 1 ? 'page-nav-btn disabled' : 'page-nav-btn';
      paginationHtml += `
      <a id="prev-btn" class="${prevClass}" href="${pageNum === 1 ? '#' : prevUrl}">
        <span class="material-symbols-rounded">navigate_before</span>
      </a>`;
      
      paginationHtml += '<div id="num-bar">';
      for (let i = 1; i <= totalPages; i++) {
        if (i === pageNum) {
          paginationHtml += `<span class="page-number current">${i}</span>`;
        } else {
          const pageUrl = i === 1 ? '/MyBlog/' : `/MyBlog/page/${i}/`;
          paginationHtml += `<a class="page-number" href="${pageUrl}">${i}</a>`;
        }
      }
      paginationHtml += '</div>';

      const nextUrl = `/MyBlog/page/${pageNum + 1}/`;
      const nextClass = pageNum === totalPages ? 'page-nav-btn disabled' : 'page-nav-btn';
      paginationHtml += `
      <a id="next-btn" class="${nextClass}" href="${pageNum === totalPages ? '#' : nextUrl}">
        <span class="material-symbols-rounded">navigate_next</span>
      </a>`;
      
      paginationHtml += '</nav>';
    }

    const indexContent = indexTpl
      .replace(/\{\{\s*post_list\s*\}\}/g, postListHtml)
      .replace(/\{\{\s*pagination\s*\}\}/g, paginationHtml);

    const fullHtml = renderPage(indexContent, {
      title: 'Tsubame 圖文窩',
      isHome: true,
      path: pageNum === 1 ? '' : `page/${pageNum}/`
    });

    if (pageNum === 1) {
      fs.writeFileSync(path.join(publicDir, 'index.html'), fullHtml);
      // Create duplicate "index" file if needed, Hexo sometimes links to /MyBlog/index
      fs.writeFileSync(path.join(publicDir, 'index'), fullHtml);
    } else {
      const pageOutDir = path.join(publicDir, 'page', String(pageNum));
      fs.mkdirSync(pageOutDir, { recursive: true });
      fs.writeFileSync(path.join(pageOutDir, 'index.html'), fullHtml);
    }
    console.log(`Compiled index page ${pageNum}`);
  }

  // Helper: Compile Archive/Taxonomy listing pages
  function compileArchiveStylePage(title, filteredPosts, destPath, relUrlPath) {
    let listHtml = '';
    let lastYear = null;

    for (const post of filteredPosts) {
      const year = post.date.getFullYear();
      if (year !== lastYear) {
        lastYear = year;
        listHtml += `
        <div class="year-line">
          <div class="year-num">${year}</div>
          <div class="dot-wrapper"><div class="dot"></div></div>
        </div>`;
      }

      const postTagsString = post.tags.map(t => `#${t}`).join(' ');

      listHtml += `
      <a class="archive-article-link" href="/MyBlog/posts/${post.id}/" title="${post.title}">
        <div class="date">${String(post.date.getMonth() + 1).padStart(2, '0')}-${String(post.date.getDate()).padStart(2, '0')}</div>
        <div class="line"><div class="dot"></div></div>
        <div class="title">
          <div class="title-inner">${post.title}</div>
        </div>
        <div class="tags">${postTagsString}</div>
      </a>`;
    }

    const archiveContent = archiveTpl
      .replace(/\{\{\s*archive_title\s*\}\}/g, title)
      .replace(/\{\{\s*archive_list\s*\}\}/g, listHtml);

    const fullHtml = renderPage(archiveContent, {
      title: `${title} | Tsubame 圖文窩`,
      path: relUrlPath
    });

    fs.mkdirSync(destPath, { recursive: true });
    fs.writeFileSync(path.join(destPath, 'index.html'), fullHtml);
  }

  // --- 3. COMPILE GLOBAL ARCHIVE PAGE ---
  compileArchiveStylePage('Archive', posts, path.join(publicDir, 'archives'), 'archives/');
  console.log('Compiled Archive page.');

  // Compile monthly archive pages (e.g. archives/2023/06/)
  for (const [key, archivePosts] of archivesMap.entries()) {
    const [year, month] = key.split('/');
    const dest = path.join(publicDir, 'archives', year, month);
    compileArchiveStylePage('Archive', archivePosts, dest, `archives/${year}/${month}/`);
    console.log(`Compiled Archive page for ${year}/${month}`);
  }

  // --- 4. COMPILE CATEGORY PAGES ---
  for (const [catPath, catPosts] of categoriesMap.entries()) {
    // If nested path e.g. "百合/少女歌劇", the output folder matches categories/百合/少女歌劇
    const dest = path.join(publicDir, 'categories', catPath);
    compileArchiveStylePage('Archive', catPosts, dest, `categories/${catPath}/`);
    console.log(`Compiled Category page: ${catPath}`);
  }

  // --- 5. COMPILE TAG PAGES ---
  for (const [tag, tagPosts] of tagsMap.entries()) {
    const dest = path.join(publicDir, 'tags', tag);
    compileArchiveStylePage('Archive', tagPosts, dest, `tags/${tag}/`);
    console.log(`Compiled Tag page: ${tag}`);
  }

  // --- 6. COMPILE ABOUT PAGE ---
  const aboutFile = path.join(__dirname, 'source', 'about.md');
  if (fs.existsSync(aboutFile)) {
    const content = fs.readFileSync(aboutFile, 'utf8');
    const fmMatch = content.match(/^---([\s\S]*?)---\n([\s\S]*)$/);
    if (fmMatch) {
      const meta = yaml.load(fmMatch[1]);
      const bodyMd = fmMatch[2];
      const bodyHtml = marked.parse(bodyMd);
      
      const pageContent = pageTpl
        .replace(/\{\{\s*id\s*\}\}/g, 'about')
        .replace(/\{\{\s*title\s*\}\}/g, meta.title || 'about')
        .replace(/\{\{\s*body\s*\}\}/g, bodyHtml);
        
      const fullHtml = renderPage(pageContent, {
        title: `${meta.title || 'about'} | Tsubame 圖文窩`,
        path: 'about/'
      });
      
      const aboutOutDir = path.join(publicDir, 'about');
      fs.mkdirSync(aboutOutDir, { recursive: true });
      fs.writeFileSync(path.join(aboutOutDir, 'index.html'), fullHtml);
      console.log('Compiled About page.');
    }
  }

  // Create .nojekyll file to tell GitHub Pages to bypass Jekyll processing
  fs.writeFileSync(path.join(publicDir, '.nojekyll'), '');
  console.log('Created .nojekyll file in public directory.');

  console.log('Build completed successfully!');
}

build();

