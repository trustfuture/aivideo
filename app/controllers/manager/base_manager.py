import threading
from typing import Any, Callable, Dict
import traceback

from loguru import logger

# Late import to avoid circulars at module import time
from app.models import const
from app.services import state as sm


class TaskManager:
    def __init__(self, max_concurrent_tasks: int):
        self.max_concurrent_tasks = max_concurrent_tasks
        self.current_tasks = 0
        self.lock = threading.Lock()
        self.queue = self.create_queue()

    def create_queue(self):
        raise NotImplementedError()

    def add_task(self, func: Callable, *args: Any, **kwargs: Any):
        with self.lock:
            if self.current_tasks < self.max_concurrent_tasks:
                print(f"add task: {func.__name__}, current_tasks: {self.current_tasks}")
                self.execute_task(func, *args, **kwargs)
            else:
                print(
                    f"enqueue task: {func.__name__}, current_tasks: {self.current_tasks}"
                )
                self.enqueue({"func": func, "args": args, "kwargs": kwargs})

    def execute_task(self, func: Callable, *args: Any, **kwargs: Any):
        thread = threading.Thread(
            target=self.run_task, args=(func, *args), kwargs=kwargs
        )
        thread.start()

    def run_task(self, func: Callable, *args: Any, **kwargs: Any):
        try:
            with self.lock:
                self.current_tasks += 1
            func(*args, **kwargs)  # call the function here, passing *args and **kwargs.
        except Exception as e:
            # Ensure failures are reflected in task state so UI can react
            task_id = kwargs.get("task_id") if isinstance(kwargs, dict) else None
            tb = traceback.format_exc()
            logger.error(f"Task {getattr(func, '__name__', str(func))} crashed: {e}\n{tb}")
            if task_id:
                try:
                    sm.state.update_task(
                        task_id,
                        state=const.TASK_STATE_FAILED,
                        progress=100,
                        error=str(e),
                    )
                except Exception as inner:
                    logger.error(f"Failed to update task state for {task_id}: {inner}")
        finally:
            self.task_done()

    def check_queue(self):
        with self.lock:
            if (
                self.current_tasks < self.max_concurrent_tasks
                and not self.is_queue_empty()
            ):
                task_info = self.dequeue()
                func = task_info["func"]
                args = task_info.get("args", ())
                kwargs = task_info.get("kwargs", {})
                self.execute_task(func, *args, **kwargs)

    def task_done(self):
        with self.lock:
            self.current_tasks -= 1
        self.check_queue()

    def enqueue(self, task: Dict):
        raise NotImplementedError()

    def dequeue(self):
        raise NotImplementedError()

    def is_queue_empty(self):
        raise NotImplementedError()
