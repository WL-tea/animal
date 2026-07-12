# innerHTML 与外部字符串

## 一、看到的现象

详情面板使用模板字符串和 `innerHTML` 生成项目列表与模型明细：

```js
element.innerHTML = `<span>${projectName}</span>`;
```

如果项目名称是普通文字，这段代码可以正常显示。但当名称包含下面的内容时：

```html
<img src=x onerror="attack()">
```

浏览器不会把它当成项目名称，而会创建一个真实的 `<img>` 节点并解析事件属性。

## 二、innerHTML 和 textContent 的区别

`innerHTML` 接收并解析 HTML：

```js
element.innerHTML = "<strong>Animal</strong>";
```

结果是一个加粗元素。

`textContent` 只写入文本：

```js
element.textContent = "<strong>Animal</strong>";
```

页面会原样显示尖括号，不会创建 `<strong>`。

只需要显示一段外部文字时，`textContent` 通常更安全。需要一次生成较复杂的静态结构时，可以继续使用模板和 `innerHTML`，但所有外部字符串都必须先进行适合 HTML 文本节点的输出编码。

## 三、为什么项目名和模型名属于外部数据

这些字符串虽然最终出现在自己的页面中，但来源不在模板代码内部：

```text
项目路径 -> statusLine 或 backup 文件
模型名称 -> Claude Code 和模型提供方
```

本机文件、工具输出和第三方模型名称都有可能因为版本变化、损坏或特殊命名而包含 HTML 字符。

因此安全边界不是“网络数据”和“本机数据”，而是：

```text
代码中确定的静态字符串
外部系统提供的动态字符串
```

## 四、HTML 文本节点需要转义什么

当前集中转义五个字符：

```text
&  -> &amp;
<  -> &lt;
>  -> &gt;
"  -> &quot;
'  -> &#39;
```

例如：

```html
<script>attack()</script>
```

转义后成为：

```html
&lt;script&gt;attack()&lt;/script&gt;
```

浏览器会显示文字 `<script>attack()</script>`，不会创建脚本节点。

`&` 要参与统一匹配和替换，否则原始实体可能被浏览器重新解释。集中函数还能避免项目标题转义了、模型名称却忘记转义的遗漏。

## 五、为什么不能只删除 script 标签

只过滤 `<script>` 是典型黑名单思路，但 HTML 中还有很多执行或破坏结构的方式，例如：

```html
<img onerror="...">
<svg onload="...">
<a href="javascript:...">
```

攻击形式会变化，黑名单很容易漏掉。

更稳定的原则是：

```text
本来只允许文字 -> 把所有 HTML 特殊字符编码成文字
```

这不是判断输入“像不像攻击”，而是明确规定输出位置只接受文本。

## 六、为什么 Electron 安全配置还不够

当前窗口已经使用：

```js
contextIsolation: true
nodeIntegration: false
```

这些设置很重要：

- `nodeIntegration: false` 防止普通页面脚本直接使用 Node.js；
- `contextIsolation: true` 隔离 preload 与页面 JavaScript 的执行环境；
- preload 只暴露有限的 `ccAPI`。

但它们不能阻止浏览器解析通过 `innerHTML` 插入的标签、样式和事件属性。即使攻击代码拿不到 Node.js，它仍可能：

- 修改或覆盖详情 UI；
- 制造误导信息；
- 触发页面内已有能力；
- 干扰事件处理和用户操作。

Electron 安全配置是在能力边界上减小危害，HTML 输出编码是在 DOM 边界上防止注入，两者需要同时存在。

## 七、输入校验和输出编码不是一回事

Issue #11 对 backup 数值进行了入口规范化：

```text
字符串费用 -> 0
负数 Token -> 0
异常对象 -> 安全结构
```

这是输入校验，目的是建立稳定数据类型。

项目名和模型名仍然允许包含普通文字、空格、中文、引号和尖括号。不能为了防注入而简单拒绝所有特殊字符，因为有些字符可能是合法名称的一部分。

这时需要输出编码：

```text
输入校验：这个值的数据类型和范围是否合法？
输出编码：这个值放进当前 HTML 上下文时如何安全表示？
```

两者解决的问题不同，不能互相替代。

## 八、为什么集中使用 escapeHtml

详情面板有三个外部字符串出口：

```text
项目列表名称
详情标题
模型名称
```

集中函数可以让它们使用同一规则：

```js
function escapeHtml(value) {
    // 把 HTML 特殊字符转换成实体
}
```

优点包括：

- 规则只维护一份；
- 容易通过 VM 测试直接验证；
- 审阅模板时可以看出哪些值已经编码；
- 后续新增外部文本时有明确入口。

如果界面结构继续变复杂，更推荐逐步改用 `document.createElement()` 和 `textContent`，减少手动拼接 HTML 的数量。

## 九、escapeHtml 的适用边界

当前函数只适合把值放进 HTML 文本节点，例如：

```html
<span>这里是经过转义的文字</span>
```

不同输出位置有不同安全规则：

```text
URL 参数 -> URL 编码和协议白名单
CSS 值 -> CSS 上下文校验
HTML 属性 -> 属性上下文编码与值约束
JavaScript 字符串 -> 不应通过 innerHTML 拼接
```

不能因为存在 `escapeHtml()`，就把它当成所有输出场景的万能清洗函数。

## 十、测试怎样证明防护生效

测试同时构造恶意项目名和模型名：

```text
<img src=x onerror="attack()">
<script>attack()</script> & "quoted" 'single'
```

断言分成两类：

```text
负向断言：生成的 HTML 中不存在原始 <img 或 <script 标签
正向断言：转义后的 &lt;、&amp;、&quot; 和 &#39; 仍然存在
```

只断言“不包含 script”还不够，因为函数可能直接删除整段项目名。正向断言可以确认安全处理后文字仍能正常显示。

## 十一、本轮学到的通用知识

```text
现象：项目名称可以在详情面板中创建真实 HTML 节点。
原因：innerHTML 会解析标签，而外部字符串未经输出编码。
知识点：动态数据进入 HTML 模板前必须按输出上下文编码；只显示文字时优先使用 textContent。
```

```text
现象：Electron 已关闭 nodeIntegration，页面仍需要处理 HTML 注入。
原因：Electron 能力隔离和浏览器 DOM 解析属于不同安全边界。
知识点：安全需要分层防护，不能依赖单一配置解决所有输入与输出问题。
```
