"""campus_project package.

Registers PyMySQL as the MySQLdb driver so Django can use the
django.db.backends.mysql backend on Windows without compiling mysqlclient.
"""

import pymysql

pymysql.install_as_MySQLdb()
