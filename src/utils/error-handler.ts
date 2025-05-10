import logger from './logger.js';

/**
 * Custom error class for application-specific errors
 */
export class AppError extends Error {
  public code: string;
  
  constructor(message: string, code: string = 'UNKNOWN_ERROR') {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

/**
 * Async function wrapper that catches and logs errors
 * @param fn The async function to wrap
 * @returns A function with the same signature but with error handling
 */
export function asyncHandler<T extends (...args: any[]) => Promise<any>>(
  fn: T
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return await fn(...args);
    } catch (error) {
      const appError = error instanceof AppError
        ? error
        : new AppError(
            error instanceof Error ? error.message : 'Unknown error',
            'UNHANDLED_ERROR'
          );
      
      logger.error(
        '[asyncHandler] Error in %s: %s (%s)', 
        fn.name || 'anonymous function', 
        appError.message, 
        appError.code
      );
      
      throw appError;
    }
  };
}

/**
 * Register global unhandled error and rejection handlers
 */
export function registerGlobalErrorHandlers() {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('[UNCAUGHT_EXCEPTION] %s\n%s', error.message, error.stack || '');
    
    // Exit with error in production, stay alive in development
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error(
      '[UNHANDLED_REJECTION] Unhandled promise rejection at: %s\nReason: %s',
      promise,
      reason instanceof Error ? `${reason.message}\n${reason.stack || ''}` : reason
    );
  });
  
  logger.info('Global error handlers registered');
}