import * as puppeteer from "puppeteer-core";
import { Page, Browser } from "puppeteer-core";
import sharp from "sharp";
import { BrowserFingerprintWithHeaders, Fingerprint, FingerprintGenerator } from "fingerprint-generator";

// 为全局window对象添加自定义属性的类型声明
declare global {
  interface Window {
    updateMousePosition: (x: number, y: number, width: number, height: number) => void;
    _mouseTrackingListener?: (e: MouseEvent) => void;
  }
}

// 会话配置接口
interface CreateSessionRequest {
  sessionId?: string;
  proxyUrl?: string;
  userAgent?: string;
  sessionContext?: {
    cookies?: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      expires?: number;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
    }>;
    localStorage?: Record<string, Record<string, any>>;
  };
  isSelenium?: boolean;
  blockAds?: boolean;
  logSinkUrl?: string;
  extensions?: string[];
  timezone?: string;
  dimensions?: {
    width: number;
    height: number;
  };
}

interface SessionDetails {
  id: string;
  createdAt: string;
  status: 'idle' | 'live' | 'released' | 'failed';
  duration: number;
  eventCount: number;
  dimensions?: {
    width: number;
    height: number;
  };
  timeout: number;
  creditsUsed: number;
  websocketUrl: string;
  debugUrl: string;
  debuggerUrl: string;
  sessionViewerUrl: string;
  userAgent?: string;
  proxy?: string;
  proxyTxBytes: number;
  proxyRxBytes: number;
  solveCaptcha?: boolean;
  isSelenium?: boolean;
}

// 视图配置接口
interface ViewConfig {
  fps: number;
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // 触控板模式 or 触摸/鼠标模式
  touchMode?: "touchpad" | "touch";
  keepRatio?: boolean;
}

export interface FormField {
  id?: string;
  name?: string;
  type: string;
  value: string;
  placeholder?: string;
  className?: string;
  tagName?: string;
  selectorPath?: string;
}

// 鼠标位置接口
export interface MousePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private pages: Map<string, Page> = new Map();
  private viewConfigs: Map<string, ViewConfig> = new Map();
  private mousePositions: Map<string, MousePosition> = new Map();
  private sessionDetails: SessionDetails | null = null;
  private fingerprintGenerator: FingerprintGenerator;

  constructor() {
    this.fingerprintGenerator = new FingerprintGenerator({
      browsers: [
        {name: "chrome", minVersion: 95},
      ],
      devices: ["desktop"],
      operatingSystems: ["macos"],
    });
  }

  // 生成浏览器指纹
  private generateFingerprint(): BrowserFingerprintWithHeaders {
    return this.fingerprintGenerator.getFingerprint({
      devices: ["desktop"],
      operatingSystems: ["macos"],
      browsers: [{name: "chrome", minVersion: 95}],
    });
  }

  // 创建会话并获取WebSocket URL
  async createBrowserSession(config: CreateSessionRequest = {}): Promise<SessionDetails> {
    try {
      console.log("创建浏览器会话，配置:", config);
      
      const response = await fetch('http://localhost:3000/v1/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config)
      });
      
      if (!response.ok) {
        throw new Error(`创建会话失败: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json() as SessionDetails;
      this.sessionDetails = data;
      
      console.log("会话创建成功，详情:", this.sessionDetails);
      return data;
    } catch (error) {
      console.error("创建浏览器会话失败:", error);
      throw error;
    }
  }

  // 初始化浏览器
  async init(sessionConfig?: CreateSessionRequest) {
    try {
      const fingerprint = this.generateFingerprint();
      console.log("生成的指纹信息:", fingerprint.fingerprint.navigator.userAgent);

      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          "--disable-gpu", 
          "--no-sandbox",
          '--disable-responsive-ui',
          '--force-device-scale-factor=1',
          '--disable-web-security',
          "--disable-setuid-sandbox",
          "--use-angle=disabled",
          "--disable-blink-features=AutomationControlled",
          "--remote-allow-origins=*",
          "--disable-dev-shm-usage",
          "--webrtc-ip-handling-policy=disable_non_proxied_udp",
          "--force-webrtc-ip-handling-policy",
          `--user-agent=${fingerprint.fingerprint.navigator.userAgent}`,
        ],
        executablePath:
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      });
      console.log("Browser initialized");
    } catch (error) {
      console.error("初始化浏览器失败:", error);
      throw error;
    }
  }

  // 获取当前会话详情
  getSessionDetails(): SessionDetails | null {
    return this.sessionDetails;
  }

  // 创建新页面
  async createPage(viewId: string, url: string): Promise<Page> {
    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    try {
      // 创建上下文和页面
      // const context = await this.browser.createBrowserContext();

      // console.log("context",context);

      // context.on('targetcreated', async target => {
      //   console.log('targetcreated', target.url(),target.type());
      // });
      // context.on('targetchanged', async target => {
      //   console.log('targetchanged', target.url(),target.type());
      // });
      // context.on('targetdestroyed', async target => {
      //   console.log('targetdestroyed', target.url(),target.type());
      // });
      
      let page = await this.browser.target().page();
      if(!page){
        console.log("page not found, creating new page");
        page = await this.browser.newPage();
      }

      page.on('pageerror', (error) => {
        console.error('Page error:', error);
      });


      // 设置页面导航监听器
      this.setupPageNavigationListener(viewId, page);
      // 设置视口大小
      await page.setViewport({ width: 1280, height: 800 ,deviceScaleFactor:1});

      // 应用指纹
      const fingerprint = this.generateFingerprint();
      await page.setUserAgent(fingerprint.fingerprint.navigator.userAgent);

      // 注入指纹数据
      await page.evaluateOnNewDocument((fingerprint :Fingerprint) => {
        // 覆盖navigator属性
        Object.defineProperty(navigator, 'platform', { value: fingerprint.navigator.platform });
        Object.defineProperty(navigator, 'userAgent', { value: fingerprint.navigator.userAgent });
        Object.defineProperty(navigator, 'language', { value: fingerprint.navigator.language });
        Object.defineProperty(navigator, 'languages', { value: fingerprint.navigator.languages });
        
        // 覆盖screen属性
        Object.defineProperty(screen, 'colorDepth', { value: fingerprint.screen.colorDepth });
        Object.defineProperty(screen, 'pixelDepth', { value: fingerprint.screen.pixelDepth });
        
        // 移除自动化标记
        delete (window as any).navigator.webdriver;
        delete (window as any).navigator.chrome;
        delete (window as any).navigator.msIsSiteMode;
        delete (window as any).navigator.msPointerEnabled;
        delete (window as any).navigator.msMaxTouchPoints;
        
        // 添加其他指纹属性
        Object.defineProperty(navigator, 'deviceMemory', { value: fingerprint.navigator.deviceMemory });
        Object.defineProperty(navigator, 'hardwareConcurrency', { value: fingerprint.navigator.hardwareConcurrency });
      }, fingerprint.fingerprint);

      await page.goto(url,{waitUntil: 'networkidle2',timeout: 5000}).catch(error=>{
        console.error('Page error:', error);
      });

      // 存储页面和默认配置
      this.pages.set(viewId, page);
      this.viewConfigs.set(viewId, {
        fps: 2,
        clip: undefined,
        touchMode: "touch",
      });

      // 初始化鼠标位置
      const viewport = page.viewport();
      this.mousePositions.set(viewId, {
        x: 0,
        y: 0,
        width: viewport?.width || 0,
        height: viewport?.height || 0
      });

         // 使用exposeFunction，避免序列化开销
         await page.exposeFunction('updateMousePosition', (x: number, y: number, width: number, height: number) => {
          // 更新位置存储
          this.mousePositions.set(viewId, { x, y, width, height });
          return true;
        }).catch(error=>{
          console.error('updateMousePosition error:', error);
        });


      return page;
    } catch (error) {
      console.error(`Failed to create page for ${url}:`, error);
      throw error;
    }
  }

  // 设置页面导航监听器
  private async setupPageNavigationListener(viewId: string, page: Page): Promise<void> {
    try {
      // 监听页面导航事件
      page.on('framenavigated', async frame => {
        // 只处理主框架的导航
        if (frame === page.mainFrame()) {
          console.log(`Page navigated for viewId: ${viewId} ${frame.url()}`);
          
          // 重新注入鼠标跟踪脚本
          await this.injectMouseTrackingScript(viewId, page);
     
        }
      });

      // 监听页面错误事件，可能是页面崩溃或关闭
      page.on('error', async error => {
        console.error(`Page error for viewId: ${viewId}:`, error);
        // 可以尝试重新初始化页面
      });
    } catch (error) {
      console.error(`Failed to setup navigation listener for ${viewId}:`, error);
    }
  }

  // 注入鼠标跟踪脚本
  async injectMouseTrackingScript(viewId: string, page: Page): Promise<void> {
    try {

      console.log(`Injecting mouse tracking script for viewId: ${viewId}`);
      

      // 为页面注入鼠标指针脚本
      await page.evaluate(() => {
        console.log('injecting cursor script');
        
        // 如果已存在光标元素，先移除
        const existingCursor = document.getElementById("remote-cursor-pointer");
        if (existingCursor) {
          existingCursor.remove();
        }
        
        // 创建鼠标指针元素
        const cursor = document.createElement("div");
        cursor.id = "remote-cursor-pointer";
        cursor.style.position = "fixed";
        cursor.style.width = "16px";
        cursor.style.height = "16px";
        cursor.style.borderRadius = "50%";
        cursor.style.backgroundColor = "#ff3b30";
        cursor.style.transform = "translate(-50%, -50%)";
        cursor.style.zIndex = "9999999";
        cursor.style.pointerEvents = "none";
        cursor.style.cursor = "pointer"; // 添加指针样式

        // 当DOM加载完成后添加到body
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", () => {
            document.body.appendChild(cursor);
          });
        } else {
          document.body.appendChild(cursor);
        }
        
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        // 移除任何现有的mousemove事件监听器
        const oldListener = window._mouseTrackingListener;
        if (oldListener) {
          document.removeEventListener("mousemove", oldListener);
        }
        
        // 创建新的mousemove事件监听器
        const newListener = (e: MouseEvent) => {
          // 使用原始坐标，无需缩放转换
          const cssX = e.clientX;
          const cssY = e.clientY;
          
          // 更新光标位置
          cursor.style.left = `${cssX}px`;
          cursor.style.top = `${cssY}px`;
          
          // 传递坐标信息
          window.updateMousePosition(cssX, cssY, width, height);
        };
        
        // 保存监听器引用
        window._mouseTrackingListener = newListener;
        
        // 添加新的事件监听器
        document.addEventListener("mousemove", newListener);
      }).catch(error=>{
        console.error('injectMouseTrackingScript error:', error);
      });
      
      // 获取当前触控模式
      const config = this.getViewConfig(viewId);
      
      
    } catch (error) {
      console.error(`Failed to inject mouse tracking script for ${viewId}:`, error);
    }
  }

  // 获取存储的鼠标位置
  getMousePosition(viewId: string): MousePosition | undefined {
    return this.mousePositions.get(viewId);
  }

  // 更新存储的鼠标位置
  updateMousePosition(viewId: string, position: MousePosition): void {
    this.mousePositions.set(viewId, position);
  }

  // 获取页面
  getPage(viewId: string): Page | undefined {
    return this.pages.get(viewId);
  }

  // 更新视图配置
  updateViewConfig(viewId: string, config: Partial<ViewConfig>): void {
    const currentConfig = this.viewConfigs.get(viewId) || {
      fps: 2,
    };

    this.viewConfigs.set(viewId, { ...currentConfig, ...config });
  }

  // 获取视图配置
  getViewConfig(viewId: string): ViewConfig | undefined {
    return this.viewConfigs.get(viewId);
  }

  // 截取页面图像
  async captureScreenshot(viewId: string): Promise<Uint8Array | null> {
    try {
      const page = this.getPage(viewId);
      const config = this.getViewConfig(viewId);

      // 质量按照fps2-fps30来计算，fps越高，质量越低,最低20，最高80
      // 根据fps计算截图质量，fps范围2-30，质量范围20-80
      // 使用线性插值公式：quality = 80 - (fps - 2) * (60 / 28)
      const quality = Math.max(
        20,
        Math.min(80, 80 - ((config!.fps || 2) - 2) * (60 / 28))
      );
      if (!page || !config) {
        return null;
      }
      const screenshotOptions: puppeteer.ScreenshotOptions = {
        optimizeForSpeed: true,
        type: "webp",
        quality: quality,
        fullPage: false
      };

      if (config.clip) {
        screenshotOptions.clip = config.clip;

        // 如果设置了keepRatio，我们需要捕获整个页面，然后在客户端处理缩放
        if (config.keepRatio) {
          // console.log(`Capturing with keepRatio for viewId: ${viewId}`);
          // 这里我们仍然使用裁剪区域，客户端会根据比例来显示
        }
      }
      const screenshot = await page.screenshot(screenshotOptions);

      // 如果需要压缩或调整图像尺寸，使用sharp处理
      // 注意：这里调整尺寸后会影响坐标系，需谨慎处理
      // 如果后端调整了尺寸，前端需要知道调整前后的比例关系
      // fps越高，图片质量越低,最低20，最高80,但是2秒至少有一帧是80
      // const processedScreenshot = await sharp(screenshot).webp({ quality: quality }).toBuffer();
      
      // 发送压缩后的二进制数据
      return screenshot;
    } catch (error) {
      console.error(`Screenshot error for ${viewId}:`, error);
      return null;
    }
  }

  // 执行页面事件
  async executeEvent(
    viewId: string,
    eventType: string,
    eventData: any
  ): Promise<any> {
    const page = this.getPage(viewId);
    if (!page) {
      throw new Error(`No page found for viewId: ${viewId}`);
    }
    const config = this.getViewConfig(viewId);
    if (config?.clip && eventData.x && eventData.y) {
      if(config.touchMode === "touch"){
        eventData.x = Math.max(config?.clip?.x, Math.min(config?.clip?.x + config?.clip?.width, eventData.x + config?.clip?.x)) as number;
        eventData.y = Math.max(config?.clip?.y, Math.min(config?.clip?.y + config?.clip?.height, eventData.y + config?.clip?.y)) as number;
      }else{
        eventData.x = Math.max(config?.clip?.x, Math.min(config?.clip?.x + config?.clip?.width, eventData.x )) as number;
        eventData.y = Math.max(config?.clip?.y, Math.min(config?.clip?.y + config?.clip?.height, eventData.y )) as number;
      }
      console.log("clip", eventData);
    
    }

    try {
      switch (eventType) {
        case "click":
          console.log("click", eventData);
          await page.mouse.click(eventData.x, eventData.y);
          break;
        case "mousedown":
          console.log("mousedown", eventData);
          await page.mouse.down();
          break;
        case "mouseup":
          console.log("mouseup", eventData);
          await page.mouse.up();
          break;
        case "mousemove":
          console.log("mousemove", eventData);
          await page.mouse.move(eventData.x, eventData.y);
          break;
        case "scroll":
          await page.evaluate((data) => {
            window.scrollBy(data.deltaX || 0, data.deltaY || 0);
          }, eventData);
          break;
        case "keydown":
        case "keyup":
        case "keypress":
          if (eventData.key) {
            const method =
              eventType === "keydown"
                ? "down"
                : eventType === "keyup"
                ? "up"
                : "press";
            await page.keyboard[method](eventData.key);
          }
          break;
        default:
          console.warn(`Unhandled event type: ${eventType}`);
      }

      return { success: true };
    } catch (error) {
      console.error(`Failed to execute ${eventType}:`, error);
      throw error;
    }
  }

  // 获取表单数据
  async extractForm(viewId: string): Promise<FormField[]> {
    const page = this.getPage(viewId);
    if (!page) {
      throw new Error(`No page found for viewId: ${viewId}`);
    }

    try {
      // 获取当前视图配置，判断是否处于裁剪模式
      const config = this.getViewConfig(viewId);
      const clipArea = config?.clip;

      // 提取页面上所有表单元素
      const formData = (await page.evaluate((clipArea) => {
        // 调试开关，设置为true时输出调试信息
        const DEBUG = true;

        // 调试日志函数
        const log = (...args: unknown[]) => {
          if (DEBUG) {
            console.log(...args);
          }
        };

        log("开始提取表单数据");

        // 定义检查元素是否在可视区域内的函数
        function isElementInViewport(
          el: HTMLElement,
          rect = {
            top: 0,
            left: 0,
            bottom: window.innerHeight || document.documentElement.clientHeight,
            right: window.innerWidth || document.documentElement.clientWidth,
          }
        ) {
          const elementRect = el.getBoundingClientRect();
          return (
            elementRect.top >= rect.top &&
            elementRect.left >= rect.left &&
            elementRect.bottom <= rect.bottom &&
            elementRect.right <= rect.right
          );
        }

        // 步骤1: 选择所有text类型的input和textarea元素
        const allInputs = Array.from(
          document.querySelectorAll("input, textarea")
        ) as HTMLInputElement[];
        log(
          `步骤1: 找到 ${allInputs.length} 个 text 类型输入框和 textarea`,
          allInputs
        );

        // 步骤2: 过滤掉不可见元素
        const visibilityFiltered = allInputs.filter((input) => {
          const elem = input;
          const isVisible = !(
            elem.offsetParent === null ||
            window.getComputedStyle(elem).display === "none" ||
            window.getComputedStyle(elem).visibility === "hidden" ||
            (elem.tagName === "INPUT" &&
              elem.type !== "text" &&
              elem.type !== "password" &&
              elem.type !== "email" &&
              elem.type !== "tel" &&
              elem.type !== "number")
          );

          return isVisible;
        });
        log(`步骤2: 可见元素过滤后剩余 ${visibilityFiltered.length} 个`);

        // 步骤3: 过滤在视口内的元素
        const viewportFiltered = visibilityFiltered.filter((input) => {
          // 使用自定义区域或默认视口区域检查
          const viewportRect = clipArea
            ? {
                top: clipArea.y,
                left: clipArea.x,
                bottom: clipArea.y + clipArea.height,
                right: clipArea.x + clipArea.width,
              }
            : undefined;

          const inViewport = isElementInViewport(input, viewportRect);
          return inViewport;
        });
        log(`步骤3: 视口区域过滤后剩余 ${viewportFiltered.length} 个`);

        // 步骤4: 计算每个元素的z-index
        const withZIndex = viewportFiltered.map((input) => {
          // 获取元素的z-index
          let zIndex = 0;

          let current = input;

          while (current && current !== document.body) {
            const style = window.getComputedStyle(current);
            if (style.position !== "static") {
              const currentZIndex = parseInt(style.zIndex, 10);
              if (!isNaN(currentZIndex) && currentZIndex > zIndex) {
                zIndex = currentZIndex;
              }
            }
            // @ts-ignore
            current = current.parentElement;
          }

          return { element: input, zIndex };
        });

        // 步骤5: 按z-index排序
        const sorted = withZIndex.sort((a, b) => b.zIndex - a.zIndex);
        log(`步骤5: 按z-index排序后保持 ${sorted.length} 个`);

        // 步骤6: 获取前5个元素
        const topFive = sorted.slice(0, 5);
        log(`步骤6: 取前5个元素，实际获取 ${topFive.length} 个`);

        // 步骤7: 提取元素属性并处理值长度
        const result = topFive.map((item) => {
          const elem = item.element;
          const value = elem.value;

          // 如果值超过1KB，则不包含
          const truncatedValue = value.length > 1024 ? "" : value;
          
          // 获取父级元素和祖父级元素
          const parentElement = elem.parentElement;
          const grandParentElement = parentElement?.parentElement;
          
          // 构建选择器路径，使用tagName和id而不是className
          let selectorPath = '';
          
          // 构建父元素选择器
          let parentSelector = '';
          if (parentElement) {
            parentSelector = parentElement.tagName.toLowerCase();
            if (parentElement.id) {
              parentSelector += `#${parentElement.id}`;
            }
          }
          
          // 构建祖父元素选择器
          let grandParentSelector = '';
          if (grandParentElement) {
            grandParentSelector = grandParentElement.tagName.toLowerCase();
            if (grandParentElement.id) {
              grandParentSelector += `#${grandParentElement.id}`;
            }
          }
          
          // 组合选择器路径
          if (grandParentSelector && parentSelector) {
            selectorPath = `${grandParentSelector} > ${parentSelector}`;
          } else if (parentSelector) {
            selectorPath = parentSelector;
          }
          
          log(
            `处理元素 ID: ${elem.id || "无ID"}, Name: ${
              elem.name || "无Name"
            }, 值长度: ${value.length}, 父级: ${parentSelector}, 祖父级: ${grandParentSelector}`
          );

          return {
            id: elem.id,
            name: elem.name,
            type: elem.type || "text",
            value: truncatedValue,
            placeholder: elem.placeholder,
            tagName: elem.tagName,
            className: elem.className,
            selectorPath: selectorPath
          };
        });

        log(`表单提取完成，共提取 ${result.length} 个元素`);
        return result;
      }, clipArea)) as FormField[];

      return formData;
    } catch (error) {
      console.error("Failed to extract form:", error);
      throw error;
    }
  }

  // 填充表单
  async fillForm(viewId: string, formData: FormField[]): Promise<void> {
    const page = this.getPage(viewId);
    if (!page) {
      throw new Error(`No page found for viewId: ${viewId}`);
    }

    try {
      for (const field of formData) {
        const tagName = field.tagName?.toLowerCase() || '';
        
        // 构建更精确的选择器
        let selector = '';

        // 优先使用ID查找
        if (field.id) {
          selector = `#${field.id}`;
        }else{
          if(field.selectorPath){
            selector = `${field.selectorPath}`;
          }
          if(field.className){
            selector = `${selector} .${field.className}`;
          }

          selector = `${selector} ${tagName}`;
          if(field.type){
            selector = `${selector}[type="${field.type}"]`;
          }
          if(field.placeholder){
            selector = `${selector}[placeholder="${field.placeholder}"]`;
          }
        }
        
       

        console.log(`尝试使用选择器填充表单字段: ${selector}`);

        if (selector) {
          try {
            const inputHandle = await page.$(selector);
            console.log(`inputHandle: ${inputHandle}`);
            if (inputHandle) {
              
              // 清空输入框内容
              await inputHandle.evaluate(input => {
                (input as HTMLInputElement).value = '';
                const event = new Event('input', { bubbles: true });
                input.dispatchEvent(event);
              });
              console.log(`清空输入框内容: ${selector}`);
            }

            await page.type(selector, field.value || '');
              console.log(`成功填充字段: ${selector}`);
           
          } catch (error) {
            console.error(`填充字段时出错: ${selector}`, error);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fill form:", error);
      throw error;
    }
  }

  // 关闭浏览器
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.pages.clear();
      this.viewConfigs.clear();
    }
  }
}
