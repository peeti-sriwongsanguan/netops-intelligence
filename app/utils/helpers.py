"""
Shared helpers: pagination, response wrappers, validators.
"""
from flask import current_app


def paginate_query(query, request):
    """Return a paginated JSON-serialisable dict from a SQLAlchemy query."""
    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(
        request.args.get("per_page", current_app.config["DEFAULT_PAGE_SIZE"], type=int),
        current_app.config["MAX_PAGE_SIZE"],
    )
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    # Try .to_dict() on items; fall back to str()
    items = []
    for item in pagination.items:
        try:
            items.append(item.to_dict())
        except AttributeError:
            items.append(str(item))

    return {
        "status": "ok",
        "data": items,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": pagination.total,
            "pages": pagination.pages,
            "has_next": pagination.has_next,
            "has_prev": pagination.has_prev,
        },
    }


def success(data, message: str = None):
    resp = {"status": "ok", "data": data}
    if message:
        resp["message"] = message
    return resp


def error(message: str, code: int = None):
    resp = {"status": "error", "message": message}
    if code:
        resp["code"] = code
    return resp
