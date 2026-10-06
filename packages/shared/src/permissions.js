"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_PERMISSIONS = exports.RoleEnum = exports.PermissionsEnum = void 0;
var PermissionsEnum;
(function (PermissionsEnum) {
    PermissionsEnum["WORKFLOW_READ"] = "workflow:read";
    PermissionsEnum["WORKFLOW_WRITE"] = "workflow:write";
    PermissionsEnum["SUBSCRIBER_READ"] = "subscriber:read";
    PermissionsEnum["SUBSCRIBER_WRITE"] = "subscriber:write";
    PermissionsEnum["NOTIFICATION_READ"] = "notification:read";
    PermissionsEnum["EVENT_WRITE"] = "event:write";
    PermissionsEnum["API_KEY_READ"] = "api_key:read";
    PermissionsEnum["INTEGRATION_READ"] = "integration:read";
    PermissionsEnum["INTEGRATION_WRITE"] = "integration:write";
})(PermissionsEnum || (exports.PermissionsEnum = PermissionsEnum = {}));
var RoleEnum;
(function (RoleEnum) {
    RoleEnum["ADMIN"] = "admin";
    RoleEnum["MEMBER"] = "member";
})(RoleEnum || (exports.RoleEnum = RoleEnum = {}));
exports.ROLE_PERMISSIONS = {
    [RoleEnum.ADMIN]: Object.values(PermissionsEnum),
    [RoleEnum.MEMBER]: [
        PermissionsEnum.WORKFLOW_READ,
        PermissionsEnum.SUBSCRIBER_READ,
        PermissionsEnum.NOTIFICATION_READ,
        PermissionsEnum.INTEGRATION_READ,
    ],
};
